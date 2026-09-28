import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { AnchorCallbackController } from './anchor-callback.controller';
import { AnchorService } from './anchor.service';
import { BalanceService } from './balance.service';
import { GroupsService } from './groups.service';
import { LockedPlansService } from './locked-plans.service';
import { SavingsService } from './savings.service';
import { AnchorDeposit } from './entities/anchor-deposit.entity';
import { Balance } from './entities/balance.entity';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { GoalsModule } from '../goals/goals.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

/**
 * e2e test: yield opt-in -> harvest -> withdraw flow
 *
 * Exercises the full yield lifecycle end to end:
 *   1. deposit into the yield adapter (opt-in)
 *   2. a simulated harvest
 *   3. a withdrawal request
 *   4. cooldown elapsing
 *   5. a claim
 *
 * At each step the projected position and the notifications emitted are
 * asserted so that any regression in the flow fails clearly.
 */
describe('Yield lifecycle (e2e)', () => {
  let app: INestApplication;
  let anchorService: AnchorService;
  let balanceService: BalanceService;
  let savingsService: SavingsService;
  let callbackController: AnchorCallbackController;

  const userId = 'user-yield-e2e';
  const yieldAdapterId = 'yield-adapter-e2e';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [AnchorDeposit, Balance, Group, GroupMember],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([AnchorDeposit, Balance, Group, GroupMember]),
        CacheModule.register({ ttl: 10_000 }),
        GoalsModule,
        WebhooksModule,
      ],
      controllers: [AnchorCallbackController],
      providers: [
        AnchorService,
        BalanceService,
        GroupsService,
        LockedPlansService,
        SavingsService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    anchorService = moduleRef.get(AnchorService);
    balanceService = moduleRef.get(BalanceService);
    savingsService = moduleRef.get(SavingsService);
    callbackController = moduleRef.get(AnchorCallbackController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs deposit -> harvest -> withdraw -> cooldown -> claim and asserts position + notifications at each step', async () => {
    // --- Step 1: deposit into the yield adapter (opt-in) -------------------
    const depositAmount = 1_000;
    const deposit = await anchorService.createDeposit({
      userId,
      amount: depositAmount,
      assetCode: 'USDC',
      adapterId: yieldAdapterId,
      yieldOptIn: true,
    } as any);

    expect(deposit).toBeDefined();
    expect(deposit.userId).toBe(userId);
    expect(deposit.amount).toBe(depositAmount);
    expect(deposit.yieldOptIn).toBe(true);

    const positionAfterDeposit = await savingsService.getProjectedPosition(userId);
    expect(positionAfterDeposit).toBeDefined();
    expect(positionAfterDeposit.principal).toBe(depositAmount);
    expect(positionAfterDeposit.yieldOptIn).toBe(true);
    expect(positionAfterDeposit.accruedYield).toBe(0);

    const depositNotifications = await savingsService.getNotifications(userId);
    expect(depositNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'yield_opt_in', userId }),
      ]),
    );

    // --- Step 2: simulated harvest ----------------------------------------
    const harvestedYield = 42;
    const harvest = await anchorService.recordHarvest({
      userId,
      adapterId: yieldAdapterId,
      yieldAmount: harvestedYield,
    } as any);

    expect(harvest).toBeDefined();
    expect(harvest.yieldAmount).toBe(harvestedYield);

    const positionAfterHarvest = await savingsService.getProjectedPosition(userId);
    expect(positionAfterHarvest.principal).toBe(depositAmount);
    expect(positionAfterHarvest.accruedYield).toBe(harvestedYield);
    expect(positionAfterHarvest.total).toBe(depositAmount + harvestedYield);

    const harvestNotifications = await savingsService.getNotifications(userId);
    expect(harvestNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'yield_harvested', userId }),
      ]),
    );

    // --- Step 3: withdrawal request ---------------------------------------
    const withdrawAmount = 500;
    const withdrawal = await savingsService.requestWithdrawal({
      userId,
      amount: withdrawAmount,
    } as any);

    expect(withdrawal).toBeDefined();
    expect(withdrawal.userId).toBe(userId);
    expect(withdrawal.amount).toBe(withdrawAmount);
    expect(withdrawal.status).toBe('pending');
    expect(withdrawal.cooldownEndsAt).toBeDefined();

    const positionAfterWithdrawRequest = await savingsService.getProjectedPosition(userId);
    expect(positionAfterWithdrawRequest.pendingWithdrawal).toBe(withdrawAmount);
    expect(positionAfterWithdrawRequest.principal).toBe(depositAmount);

    const withdrawNotifications = await savingsService.getNotifications(userId);
    expect(withdrawNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'withdrawal_requested', userId }),
      ]),
    );

    // --- Step 4: cooldown elapsing ----------------------------------------
    const cooldownEndsAt = new Date(withdrawal.cooldownEndsAt).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cooldownEndsAt + 1_000);

    const cooldownStatus = await savingsService.getWithdrawalStatus(withdrawal.id);
    expect(cooldownStatus).toBeDefined();
    expect(cooldownStatus.cooldownElapsed).toBe(true);
    expect(cooldownStatus.claimable).toBe(true);

    const positionAfterCooldown = await savingsService.getProjectedPosition(userId);
    expect(positionAfterCooldown.pendingWithdrawal).toBe(withdrawAmount);
    expect(positionAfterCooldown.claimable).toBe(true);

    // --- Step 5: claim ----------------------------------------------------
    const claim = await savingsService.claimWithdrawal(withdrawal.id);

    expect(claim).toBeDefined();
    expect(claim.status).toBe('completed');
    expect(claim.amount).toBe(withdrawAmount);

    const positionAfterClaim = await savingsService.getProjectedPosition(userId);
    expect(positionAfterClaim.principal).toBe(depositAmount - withdrawAmount);
    expect(positionAfterClaim.pendingWithdrawal).toBe(0);
    expect(positionAfterClaim.claimable).toBe(false);

    const claimNotifications = await savingsService.getNotifications(userId);
    expect(claimNotifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'withdrawal_claimed', userId }),
      ]),
    );

    // The callback controller must reflect the same terminal state.
    const callbackResult = await callbackController.handleCallback({
      transactionId: withdrawal.id,
      status: 'completed',
    } as any);
    expect(callbackResult).toBeDefined();

    const finalBalance = await balanceService.getBalance(userId);
    expect(finalBalance).toBeDefined();

    jest.restoreAllMocks();
  });
});
