import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoalsService } from '../goals/goals.service';
import { BalanceService } from './balance.service';
import { LockedPlansService } from './locked-plans.service';
import { ListGoalsDto } from './dto/list-goals.dto';
import { ListLockedDto } from './dto/list-locked.dto';
import { SavingsSummaryDto } from './dto/savings-summary.dto';
import { YieldPositionResponseDto } from './dto/yield-position-response.dto';
import { YieldRateResponseDto } from './dto/yield-rate-response.dto';
import { YieldAdminOverviewResponseDto } from './dto/yield-admin-overview-response.dto';
import { SavingsAddressListQueryDto } from './dto/savings-list-query.dto';
import { SavingsAddressParamDto } from './dto/stellar-address.dto';
import { SavingsService } from './savings.service';
import { User } from '../users/entities/user.entity';

@ApiTags('savings')
@Controller('savings')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SavingsController {
  constructor(
    private readonly savingsService: SavingsService,
    private readonly goalsService: GoalsService,
    private readonly lockedPlansService: LockedPlansService,
    private readonly balanceService: BalanceService,
  ) {}

  /**
   * GET /savings/ping
   *
   * Liveness check for the savings module.
   */
  @Get('ping')
  @Public()
  @ApiOperation({ summary: 'Savings module liveness check' })
  @ApiResponse({ status: 200, description: 'Savings module is up' })
  ping() {
    return this.savingsService.ping();
  }

  /**
   * GET /savings/goals?address=&page=&limit=&sort=
   *
   * Lists an address's goals with progress (target/current amount, status),
   * paginated. `page`/`limit`/`sort` are validated and capped via
  * `SavingsAddressListQueryDto` — an invalid value (non-integer, `page < 1`,
   * `limit` outside 1-100, or a `sort` other than `asc`/`desc`) is rejected
   * with a 400 rather than silently coerced.
   */
  @Get('goals')
  @Public()
  @ApiOperation({ summary: "List an address's savings goals with progress" })
  @ApiQuery({ name: 'address', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: "Paginated list of the address's goals",
    type: ListGoalsDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid page, limit, or sort value',
  })
  async listGoals(
    @Query() query: SavingsAddressListQueryDto,
  ): Promise<ListGoalsDto> {
    const {
      data,
      total,
      page: p,
      limit: l,
    } = await this.goalsService.listByOwnerPaginated(
      query.address,
      query.page,
      query.limit,
      query.sort,
    );
    return { address: query.address, goals: data, total, page: p, limit: l };
  }

  /**
   * GET /savings/locked?address=&page=&limit=&sort=
   *
   * Lists an address's locked plans, ordered by `unlock_at` (soonest-
   * unlocking first by default), paginated. `page`/`limit`/`sort` are
   * validated and capped the same way as `listGoals` above.
   */
  @Get('locked')
  @Public()
  @ApiOperation({ summary: "List an address's locked savings plans" })
  @ApiQuery({ name: 'address', required: true, type: String })
  @ApiResponse({
    status: 200,
    description:
      "Paginated list of the address's locked plans, ordered by unlock_at",
    type: ListLockedDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid page, limit, or sort value',
  })
  async listLocked(
    @Query() query: SavingsAddressListQueryDto,
  ): Promise<ListLockedDto> {
    const {
      data,
      total,
      page: p,
      limit: l,
    } = await this.lockedPlansService.listByOwner(
      query.address,
      query.page,
      query.limit,
      query.sort,
    );
    return { address: query.address, plans: data, total, page: p, limit: l };
  }

  /**
   * GET /savings/accounts/:address
   *
   * Returns the projected flexible balance for a Stellar account, along
   * with when it was first observed and last updated. 404s if no account
   * has ever been observed for this address (distinct from a zero balance).
   */
  @Get('accounts/:address')
  @Public()
  @ApiOperation({ summary: "Get an address's flexible savings balance" })
  @ApiParam({ name: 'address', description: 'Stellar account address' })
  @ApiResponse({
    status: 200,
    description: 'Balance and timestamps for the account',
  })
  @ApiResponse({
    status: 404,
    description: 'No account exists for this address',
  })
  async getAccount(@Param() params: SavingsAddressParamDto) {
    const { address } = params;
    const account = await this.balanceService.findAccount(address);
    if (!account) {
      throw new NotFoundException(
        `No savings account found for address: ${address}`,
      );
    }
    return account;
  }

  /**
   * GET /savings/summary?address=
   *
   * Returns per-product savings totals (flexible balance + goals saved)
   * for `address`, plus a grand total across all tracked products. Backs
   * the dashboard's savings overview.
   */
  @Get('summary')
  @Public()
  @ApiOperation({ summary: "Get an address's per-product savings summary" })
  @ApiQuery({ name: 'address', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Per-product totals and grand total for the address',
    type: SavingsSummaryDto,
  })
  @ApiResponse({
    status: 400,
    description: 'address query parameter is required',
  })
  async summary(
    @Query('address') address?: string,
  ): Promise<SavingsSummaryDto> {
    if (!address) {
      throw new BadRequestException('address query parameter is required');
    }
    return this.savingsService.summary(address);
  }

  /**
   * GET /savings/yield/position
   *
   * Returns the authenticated caller's yield-adapter position:
   * shares held, estimated asset value, and pending withdrawal status.
   * Returns a well-formed empty response (200) if the user has no position,
   * not a 404.
   */
  @Get('yield/position')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated user's yield position" })
  @ApiResponse({
    status: 200,
    description: "User's yield position with shares and estimated value",
    type: YieldPositionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getYieldPosition(
    @CurrentUser() user: User,
  ): Promise<YieldPositionResponseDto> {
    return this.savingsService.getYieldPosition(user.stellar_address);
  }

  /**
   * GET /savings/yield/rate
   *
   * Returns the current yield-adapter rate (APR/APY) and the timestamp it
   * was last observed. Public — no authentication required.
   */
  @Get('yield/rate')
  @Public()
  @ApiOperation({ summary: 'Get the current yield rate (APR/APY)' })
  @ApiResponse({
    status: 200,
    description: 'Current yield rate and last-observed timestamp',
    type: YieldRateResponseDto,
  })
  async getYieldRate(): Promise<YieldRateResponseDto> {
    return this.savingsService.getYieldRate();
  }

  /**
   * GET /savings/yield/admin/overview
   *
   * Returns an admin-facing overview of the yield adapter: total shares,
   * total estimated value, and the number of active positions. Requires
   * authentication.
   */
  @Get('yield/admin/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the admin yield adapter overview' })
  @ApiResponse({
    status: 200,
    description: 'Aggregate yield adapter totals and active position count',
    type: YieldAdminOverviewResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getYieldAdminOverview(): Promise<YieldAdminOverviewResponseDto> {
    return this.savingsService.getYieldAdminOverview();
  }
}
