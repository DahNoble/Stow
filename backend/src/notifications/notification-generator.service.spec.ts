import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationGeneratorService } from './notification-generator.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';

describe('NotificationGeneratorService', () => {
  let service: NotificationGeneratorService;
  let notificationsService: jest.Mocked<Partial<NotificationsService>>;
  let userRepository: jest.Mocked<Partial<Repository<User>>>;
  let userPreferencesRepository: jest.Mocked<Partial<Repository<UserPreferences>>>;
  let notificationsRepository: jest.Mocked<Partial<Repository<Notification>>>;

  beforeEach(async () => {
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 1 } as Notification),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    userPreferencesRepository = {
      findOne: jest.fn(),
    };

    notificationsRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGeneratorService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationsRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: userPreferencesRepository,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    service = module.get<NotificationGeneratorService>(
      NotificationGeneratorService,
    );
  });

  describe('handleDepositReceived', () => {
    const owner = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN';

    it('creates a deposit notification when preferences allow it', async () => {
      userRepository.findOne!.mockResolvedValue({
        id: 'user-uuid-1',
        stellar_address: owner,
      } as User);
      userPreferencesRepository.findOne!.mockResolvedValue({
        userId: 'user-uuid-1',
        deposit_notifications: true,
      } as UserPreferences);

      await service.handleDepositReceived({
        owner,
        amount: '10000000',
        asset: 'USDC',
      });

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        owner,
        NotificationType.Deposit,
        expect.stringContaining('Deposit confirmed'),
        expect.stringContaining('10000000'),
        expect.objectContaining({
          amount: '10000000',
          asset: 'USDC',
        }),
        'user-uuid-1',
      );
    });

    it('creates notification with address-only when user record is not found', async () => {
      userRepository.findOne!.mockResolvedValue(null);

      await service.handleDepositReceived({
        owner,
        amount: '5000000',
      });

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        owner,
        NotificationType.Deposit,
        expect.any(String),
        expect.stringContaining('5000000'),
        expect.objectContaining({ amount: '5000000' }),
        undefined,
      );
    });

    it('skips notification when user has opted out of deposit notifications', async () => {
      userRepository.findOne!.mockResolvedValue({
        id: 'user-uuid-1',
        stellar_address: owner,
      } as User);
      userPreferencesRepository.findOne!.mockResolvedValue({
        userId: 'user-uuid-1',
        deposit_notifications: false,
      } as UserPreferences);

      await service.handleDepositReceived({
        owner,
        amount: '10000000',
      });

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('resolves account or user field when owner is omitted', async () => {
      userRepository.findOne!.mockResolvedValue(null);

      await service.handleDeposit({
        account: owner,
        amount: '2000000',
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        owner,
        NotificationType.Deposit,
        expect.any(String),
        expect.stringContaining('2000000'),
        expect.any(Object),
        undefined,
      );
    });

    it('does nothing when no owner/account address is provided', async () => {
      await service.handleDepositReceived({
        amount: '1000',
      });

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('handleGroupSettled', () => {
    const member1 = 'G_MEMBER_1_ADDRESS';
    const member2 = 'G_MEMBER_2_ADDRESS';

    it('produces one notification per member on group settlement', async () => {
      userRepository.findOne!.mockImplementation(async ({ where }: any) => {
        if (where.stellar_address === member1) {
          return { id: 'uuid-1', stellar_address: member1 } as User;
        }
        if (where.stellar_address === member2) {
          return { id: 'uuid-2', stellar_address: member2 } as User;
        }
        return null;
      });

      userPreferencesRepository.findOne!.mockResolvedValue({
        group_settlement_notifications: true,
      } as UserPreferences);

      await service.handleGroupSettled({
        id: 'pool-42',
        groupName: 'Summer Trip',
        members: [
          { address: member1, amount: '500' },
          { address: member2, amount: '300' },
        ],
      });

      expect(notificationsService.create).toHaveBeenCalledTimes(2);

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        1,
        member1,
        NotificationType.GroupSettled,
        expect.stringContaining('settled'),
        expect.stringContaining('500'),
        expect.objectContaining({
          group_id: 'pool-42',
          share: '500',
          group_name: 'Summer Trip',
        }),
        'uuid-1',
      );

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        2,
        member2,
        NotificationType.GroupSettled,
        expect.stringContaining('settled'),
        expect.stringContaining('300'),
        expect.objectContaining({
          group_id: 'pool-42',
          share: '300',
          group_name: 'Summer Trip',
        }),
        'uuid-2',
      );
    });

    it('notifies a single member when payload has member and amount fields', async () => {
      userRepository.findOne!.mockResolvedValue({
        id: 'uuid-1',
        stellar_address: member1,
      } as User);
      userPreferencesRepository.findOne!.mockResolvedValue({
        group_settlement_notifications: true,
      } as UserPreferences);

      await service.handleGroupSettled({
        groupId: 'group-10',
        member: member1,
        amount: '250',
      });

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        member1,
        NotificationType.GroupSettled,
        expect.any(String),
        expect.stringContaining('250'),
        expect.objectContaining({
          group_id: 'group-10',
          share: '250',
        }),
        'uuid-1',
      );
    });

    it('skips members who have disabled group settlement notifications', async () => {
      userRepository.findOne!.mockImplementation(async ({ where }: any) => {
        if (where.stellar_address === member1) {
          return { id: 'uuid-1', stellar_address: member1 } as User;
        }
        if (where.stellar_address === member2) {
          return { id: 'uuid-2', stellar_address: member2 } as User;
        }
        return null;
      });

      userPreferencesRepository.findOne!.mockImplementation(
        async ({ where }: any) => {
          if (where.userId === 'uuid-1') {
            return {
              userId: 'uuid-1',
              group_settlement_notifications: false, // opted out
            } as UserPreferences;
          }
          return {
            userId: 'uuid-2',
            group_settlement_notifications: true,
          } as UserPreferences;
        },
      );

      await service.handleGroupSettled({
        id: 'group-opt-out',
        members: [
          { address: member1, amount: '500' },
          { address: member2, amount: '300' },
        ],
      });

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        member2,
        NotificationType.GroupSettled,
        expect.any(String),
        expect.stringContaining('300'),
        expect.any(Object),
        'uuid-2',
      );
    });

    it('does nothing when no members or member field are provided', async () => {
      await service.handleGroupSettled({
        id: 'group-empty',
      });

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
