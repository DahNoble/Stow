import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSignatureGuard } from '../webhooks/guards/webhook-signature.guard';
import { Sep24CallbackDto } from './dto/sep24-callback.dto';
import { AnchorService } from './anchor.service';

@ApiTags('savings')
@Controller('savings/anchor/callbacks')
@Public()
@UseGuards(WebhookSignatureGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AnchorCallbackController {
  private readonly logger = new Logger(AnchorCallbackController.name);

  constructor(private readonly anchorService: AnchorService) {}

  @Post('sep24')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive SEP-24 transaction status callback from anchor',
    description:
      'Verifies HMAC-SHA256 signature and updates deposit status idempotently. ' +
      'Replayed callbacks are rejected by the WebhookSignatureGuard.',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed payload or unknown transaction_id',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid signature or replayed event_id',
  })
  async handleSep24Callback(
    @Body() dto: Sep24CallbackDto,
  ): Promise<{ received: true; updated: boolean }> {
    try {
      const result = await this.anchorService.processCallback(
        dto.transaction_id,
        dto.status,
      );

      this.logger.log(
        `SEP-24 callback processed: transaction_id=${dto.transaction_id} status=${dto.status} updated=${result.updated}`,
      );

      return {
        received: true,
        updated: result.updated,
      };
    } catch (err) {
      this.logger.error(
        `Failed to process SEP-24 callback for transaction_id=${dto.transaction_id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
