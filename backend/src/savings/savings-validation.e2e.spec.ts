import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { GoalsService } from '../goals/goals.service';
import { AnchorController } from './anchor.controller';
import { AnchorService } from './anchor.service';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { LockedPlansService } from './locked-plans.service';
import { SavingsController } from './savings.controller';
import { SavingsService } from './savings.service';

describe('Savings request validation', () => {
  let app: INestApplication;
  const goalsService = { listByOwnerPaginated: jest.fn() };
  const lockedPlansService = { listByOwner: jest.fn() };
  const balanceService = {
    findAccount: jest.fn(),
    get: jest.fn(),
  };
  const anchorService = {
    initiateDeposit: jest.fn(),
    getQuote: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SavingsController, AnchorController, BalanceController],
      providers: [
        { provide: SavingsService, useValue: { ping: jest.fn() } },
        { provide: GoalsService, useValue: goalsService },
        { provide: LockedPlansService, useValue: lockedPlansService },
        { provide: BalanceService, useValue: balanceService },
        { provide: AnchorService, useValue: anchorService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects malformed savings list addresses before calling the service', async () => {
    await request(app.getHttpServer())
      .get('/savings/goals')
      .query({ address: 'not-a-stellar-address' })
      .expect(400);

    expect(goalsService.listByOwnerPaginated).not.toHaveBeenCalled();
  });

  it('rejects unknown list query fields', async () => {
    await request(app.getHttpServer())
      .get('/savings/locked')
      .query({ address: `G${'A'.repeat(55)}`, extra: 'unexpected' })
      .expect(400);

    expect(lockedPlansService.listByOwner).not.toHaveBeenCalled();
  });

  it('rejects malformed account addresses in path parameters', async () => {
    await request(app.getHttpServer())
      .get('/savings/accounts/not-a-stellar-address')
      .expect(400);

    await request(app.getHttpServer())
      .get('/savings/balance/not-a-stellar-address')
      .expect(400);

    expect(balanceService.findAccount).not.toHaveBeenCalled();
    expect(balanceService.get).not.toHaveBeenCalled();
  });

  it('rejects zero or negative SEP-38 quote amounts', async () => {
    await request(app.getHttpServer())
      .get('/savings/anchor/quote')
      .query({
        sell_asset: 'iso4217:NGN',
        buy_asset: 'stellar:USDC:GA5Z',
        sell_amount: '0',
      })
      .expect(400);

    await request(app.getHttpServer())
      .get('/savings/anchor/quote')
      .query({
        sell_asset: 'iso4217:NGN',
        buy_asset: 'stellar:USDC:GA5Z',
        sell_amount: '-1',
      })
      .expect(400);

    expect(anchorService.getQuote).not.toHaveBeenCalled();
  });

  it('rejects malformed deposit account addresses and unknown body fields', async () => {
    await request(app.getHttpServer())
      .post('/savings/anchor/deposit')
      .send({ asset_code: 'USDC', account: 'invalid-address' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/savings/anchor/deposit')
      .send({
        asset_code: 'USDC',
        account: `G${'A'.repeat(55)}`,
        extra: 'unexpected',
      })
      .expect(400);

    expect(anchorService.initiateDeposit).not.toHaveBeenCalled();
  });
});