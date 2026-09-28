import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserFlag } from './entities/user-flag.entity';
import { VerifiedAddress } from './entities/verified-address.entity';
import { AnchorDeposit } from '../savings/entities/anchor-deposit.entity';
import {
  BulkUserAction,
  BulkUserActionDto,
  BulkUserActionErrorCode,
  BulkUserActionResponseDto,
  BulkUserActionResultDto,
} from './dto/bulk-user-action.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ListVerifiedAddressesQueryDto } from './dto/list-verified-addresses-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { SavingsOverviewDto } from './dto/savings-overview.dto';
import { YieldAdminOverviewResponseDto, HarvestHistoryEntryDto } from '../savings/dto/yield-admin-overview-response.dto';
import { ContractEvent } from '../indexer/entities/contract-event.entity';
import { ConfigService } from '@nestjs/config';
import { SorobanService } from '../soroban/soroban.service';
import { Role } from '../common/enums/role.enum';

/** Expected, per-user failure in a bulk action; carries a stable code. */
class BulkUserActionError extends Error {
  constructor(
    readonly code: BulkUserActionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Administrative operations.
 *
 * After the pivot from the prediction market, this service keeps generic
 * user/role administration. Market/prediction/competition moderation, fee
 * stats, and CSV market import were removed with their modules.
 *
 * TODO(issue): add savings-domain admin (e.g. inspect group pools, flag
 * suspicious accounts) as the savings features land.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(VerifiedAddress)
    private readonly verifiedAddressesRepository: Repository<VerifiedAddress>,
    @InjectRepository(AnchorDeposit)
    private readonly anchorDepositRepository: Repository<AnchorDeposit>,
    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.where(
        'user.username ILIKE :search OR user.stellar_address ILIKE :search',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    queryBuilder.orderBy(`user.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listVerifiedAddresses(query: ListVerifiedAddressesQueryDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const qb = this.verifiedAddressesRepository.createQueryBuilder('v');

    if (search) {
      qb.where('v.address ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('v.verified_at', 'DESC').skip(skip).take(limit);

    const [addresses, total] = await qb.getManyAndCount();

    const data = addresses.map((a) => ({
      address: a.address,
      verified_at: a.verified_at.toISOString(),
      verified_by: a.verified_by,
      events_created: a.events_created,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async banUser(id: string, reason: string, adminId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.is_banned) throw new ConflictException('User is already banned');

    user.is_banned = true;
    user.ban_reason = reason;
    user.banned_at = new Date();
    user.banned_by = adminId;

    await this.usersRepository.save(user);
    this.logger.log(`Admin ${adminId} banned user ${id}: ${reason}`);
    return user;
  }

  async unbanUser(id: string, adminId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.is_banned) throw new BadRequestException('User is not banned');

    user.is_banned = false;
    user.ban_reason = null;
    user.banned_at = null;
    user.banned_by = null;

    await this.usersRepository.save(user);
    this.logger.log(`Admin ${adminId} unbanned user ${id}`);
    return user;
  }

  /**
   * Applies a moderation action to many users with per-user failure
   * isolation: every user is processed in its own transaction, so a failure
   * (missing user, invalid state, DB error) rolls back only that user's
   * change and is reported in `results` while the rest of the batch proceeds.
   */
  async bulkUserAction(
    dto: BulkUserActionDto,
    adminId: string,
  ): Promise<BulkUserActionResponseDto> {
    const results: BulkUserActionResultDto[] = [];

    for (const userId of dto.user_ids) {
      try {
        await this.applyBulkActionToUser(userId, dto, adminId);
        results.push({ user_id: userId, success: true });
      } catch (err) {
        results.push(this.toBulkFailure(userId, dto.action, err));
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    this.logger.log(
      `Admin ${adminId} performed bulk "${dto.action}" on ${dto.user_ids.length} users: ${succeeded} succeeded, ${failed} failed`,
    );

    return {
      action: dto.action,
      total: results.length,
      results,
      succeeded,
      failed,
    };
  }

  private async applyBulkActionToUser(
    userId: string,
    dto: BulkUserActionDto,
    adminId: string,
  ): Promise<void> {
    await this.usersRepository.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new BulkUserActionError(
          BulkUserActionErrorCode.NotFound,
          `User "${userId}" not found`,
        );
      }

      if (dto.action !== BulkUserAction.Unban) {
        if (user.id === adminId) {
          throw new BulkUserActionError(
            BulkUserActionErrorCode.SelfAction,
            `You cannot ${dto.action} yourself`,
          );
        }
        if (user.role === Role.Admin) {
          throw new BulkUserActionError(
            BulkUserActionErrorCode.ProtectedTarget,
            `Cannot ${dto.action} another admin`,
          );
        }
      }

      switch (dto.action) {
        case BulkUserAction.Ban:
          if (user.is_banned) {
            throw new BulkUserActionError(
              BulkUserActionErrorCode.AlreadyBanned,
              'User is already banned',
            );
          }
          user.is_banned = true;
          user.ban_reason = dto.reason ?? null;
          user.banned_at = new Date();
          user.banned_by = adminId;
          await manager.save(user);
          break;

        case BulkUserAction.Unban:
          if (!user.is_banned) {
            throw new BulkUserActionError(
              BulkUserActionErrorCode.NotBanned,
              'User is not banned',
            );
          }
          user.is_banned = false;
          user.ban_reason = null;
          user.banned_at = null;
          user.banned_by = null;
          await manager.save(user);
          break;

        case BulkUserAction.Flag:
          await manager.save(
            UserFlag,
            manager.create(UserFlag, {
              user_id: user.id,
              reason: dto.reason ?? null,
              flagged_by: adminId,
            }),
          );
          break;
      }
    });
  }

  private toBulkFailure(
    userId: string,
    action: BulkUserAction,
    err: unknown,
  ): BulkUserActionResultDto {
    if (err instanceof BulkUserActionError) {
      return {
        user_id: userId,
        success: false,
        code: err.code,
        error: err.message,
      };
    }

    // Unexpected (e.g. DB) errors: log the detail, return a generic message
    // so internal error text never reaches the client.
    this.logger.error(
      `Bulk "${action}" failed for user ${userId}`,
      err instanceof Error ? err.stack : String(err),
    );
    return {
      user_id: userId,
      success: false,
      code: BulkUserActionErrorCode.Internal,
      error: 'Unexpected error while applying action',
    };
  }

  async updateUserRole(
    id: string,
    dto: UpdateUserRoleDto,
    adminId: string,
  ): Promise<User> {
    if (id === adminId) {
      throw new BadRequestException('You cannot change your own role');
    }

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const previousRole = user.role;
    user.role = dto.role;

    await this.usersRepository.save(user);

    this.logger.log(
      `Admin ${adminId} changed role of user ${id} from "${previousRole}" to "${dto.role}"`,
    );

    return user;
  }

  /**
   * Aggregates savings metrics across all anchor_deposits rows.
   *
   * Returns:
   *  - total_deposits           — total number of deposit rows
   *  - total_savings_accounts   — number of distinct users with at least one deposit
   *  - deposits_by_status       — count breakdown by status (pending / processing / completed / failed)
   *  - computed_at              — ISO-8601 timestamp of when the query ran
   */
  async getSavingsOverview(): Promise<SavingsOverviewDto> {
    // Single query: total rows, distinct users, and per-status counts in one pass
    const rows: Array<{ status: string; count: string }> =
      await this.anchorDepositRepository
        .createQueryBuilder('d')
        .select('d.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('d.status')
        .getRawMany();

    const statusMap: Record<string, number> = {};
    let totalDeposits = 0;
    for (const row of rows) {
      const n = parseInt(row.count, 10);
      statusMap[row.status] = n;
      totalDeposits += n;
    }

    const totalAccounts: { count: string } | undefined =
      await this.anchorDepositRepository
        .createQueryBuilder('d')
        .select('COUNT(DISTINCT d.user_id)', 'count')
        .getRawOne();

    return {
      total_deposits: totalDeposits,
      total_savings_accounts: parseInt(totalAccounts?.count ?? '0', 10),
      deposits_by_status: {
        pending: statusMap['pending'] ?? 0,
        processing: statusMap['processing'] ?? 0,
        completed: statusMap['completed'] ?? 0,
        failed: statusMap['failed'] ?? 0,
      },
      computed_at: new Date().toISOString(),
    };
  }

  /**
   * Aggregates yield-adapter metrics for admin overview.
   *
   * Returns:
   *  - active_strategy_id     — id of the currently active strategy, or null if idle
   *  - active_strategy_name   — display name of the active strategy, if known
   *  - total_assets           — total assets under management (in stroops)
   *  - total_shares           — total shares minted (in share units)
   *  - exchange_rate          — current shares-to-assets ratio (scaled integer as string)
   *  - accrued_fees           — accrued-but-unswept performance fees (in stroops)
   *  - harvest_history        — recent harvest events for trend analysis
   *  - computed_at            — ISO-8601 timestamp of when the query ran
   */
  async getYieldOverview(): Promise<YieldAdminOverviewResponseDto> {
    // Fetch data from multiple sources in parallel where possible
    const [
      exchangeRate,
      totalAssets,
      totalShares,
      activeStrategyId,
      recentHarvests,
    ] = await Promise.all([
      this.sorobanService.getYieldAdapterExchangeRate(),
      this.sorobanService.getYieldAdapterTotalAssets(),
      this.sorobanService.getYieldAdapterTotalShares(),
      this.sorobanService.getYieldAdapterActiveStrategy(),
      this.getRecentHarvestEvents(10),
    ]);

    // Transform harvest events into the response format
    const harvestHistory: HarvestHistoryEntryDto[] = recentHarvests.map((h) => ({
      timestamp: h.ledger ?? 0,
      delta: h.data?.delta?.toString() ?? '0',
      fee: h.data?.fee?.toString() ?? '0',
      total_assets: h.data?.total_assets?.toString() ?? '0',
    }));

    // Get active strategy name from contract events (stored as strategy_registered events)
    let activeStrategyName: string | null = null;
    if (activeStrategyId !== null) {
      activeStrategyName = await this.getStrategyName(activeStrategyId);
    }

    // Accrued fees - read from contract storage via soroban service
    const accruedFees = await this.sorobanService.getYieldAdapterAccruedFees();

    return {
      active_strategy_id: activeStrategyId,
      active_strategy_name: activeStrategyName,
      total_assets: totalAssets ?? '0',
      total_shares: totalShares ?? '0',
      exchange_rate: exchangeRate ?? '0',
      accrued_fees: accruedFees ?? '0',
      harvest_history: harvestHistory,
      computed_at: new Date().toISOString(),
    };
  }

  /**
   * Fetches recent 'harvested' events from the contract_events table.
   */
  private async getRecentHarvestEvents(limit: number): Promise<ContractEvent[]> {
    return this.contractEventRepository.find({
      where: { event_type: 'harvested' },
      order: { ledger: 'DESC' },
      take: limit,
    });
  }

  /**
   * Looks up a strategy's display name from stored strategy_registered events.
   */
  private async getStrategyName(strategyId: number): Promise<string | null> {
    const event = await this.contractEventRepository.findOne({
      where: { event_type: 'strategy_registered' },
      order: { ledger: 'ASC' },
    });

    if (event?.data?.name) {
      return String(event.data.name);
    }
    return null;
  }
}