import { INestApplication } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { AdminAuditInterceptor } from './admin-audit.interceptor';

describe('AdminAuditInterceptor', () => {
  let app: INestApplication;
  const auditRepo = {
    create: jest.fn((entry) => entry),
    save: jest.fn(async (entry) => ({
      ...entry,
      created_at: new Date('2026-09-25T12:00:00.000Z'),
    })),
  };
  const auditAdminService = {
    getSavingsOverview: jest.fn().mockResolvedValue({ total_deposits: 0 }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: auditAdminService },
        { provide: getRepositoryToken(AdminAuditLog), useValue: auditRepo },
        AdminAuditInterceptor,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: 'admin-42' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists actor, action, target, and timestamp for savings admin access', async () => {
    await request(app.getHttpServer())
      .get('/admin/savings/overview')
      .expect(200);

    expect(auditRepo.create).toHaveBeenCalledWith({
      actor_id: 'admin-42',
      action: 'VIEW_SAVINGS_OVERVIEW',
      target_type: 'savings',
      target_id: 'overview',
      metadata: null,
    });
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-42',
        action: 'VIEW_SAVINGS_OVERVIEW',
        target_type: 'savings',
        target_id: 'overview',
      }),
    );
    await expect(auditRepo.save.mock.results[0].value).resolves.toEqual(
      expect.objectContaining({
        created_at: new Date('2026-09-25T12:00:00.000Z'),
      }),
    );
  });
});