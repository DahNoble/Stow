import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ThrottleTier } from '../common/decorators/throttle-tier.decorator';
import { User } from '../users/entities/user.entity';
import { AnchorService } from './anchor.service';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { Sep38QuoteQueryDto } from './dto/sep38-quote-query.dto';

@ApiTags('savings')
@Controller('savings/anchor')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AnchorController {
  constructor(private readonly anchorService: AnchorService) {}

  /**
   * POST /savings/anchor/deposit
   *
   * Initiates a SEP-24 interactive deposit.
   * Returns the anchor-hosted URL the user must visit to complete
   * KYC and the local-currency transfer.
   *
   * Rate limit: write tier — 30 requests / 60 s per user.
   */
  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @ThrottleTier('write')
  @ApiOperation({ summary: 'Initiate a SEP-24 interactive deposit' })
  @ApiBody({ type: InitiateDepositDto })
  @ApiResponse({ status: 201, description: 'Deposit session created' })
  @ApiResponse({ status: 429, description: 'Too many requests (write tier)' })
  initiateDeposit(
    @CurrentUser() user: User,
    @Body() dto: InitiateDepositDto,
  ) {
    return this.anchorService.initiateDeposit(user.id, dto);
  }

  /**
   * GET /savings/quote
   *
   * Returns an indicative SEP-38 local-currency ↔ USDC quote.
   * Results are cached for 30 s to reduce upstream anchor calls.
   */
  @Get('quote')
  @Public()
  @ThrottleTier('read')
  @ApiOperation({ summary: 'Get indicative SEP-38 USDC ↔ local-currency quote' })
  @ApiQuery({ name: 'sell_asset', example: 'iso4217:NGN' })
  @ApiQuery({ name: 'buy_asset', example: 'stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' })
  @ApiQuery({ name: 'sell_amount', example: '10000' })
  @ApiResponse({ status: 200, description: 'Quote returned (may be cached)' })
  @ApiResponse({ status: 502, description: 'Anchor unavailable' })
  getQuote(@Query() query: Sep38QuoteQueryDto) {
    return this.anchorService.getQuote(
      query.sell_asset,
      query.buy_asset,
      query.sell_amount,
    );
  }
}
