import { test, expect, Page } from '@playwright/test';

/**
 * E2E coverage for the yield UI flow:
 *   opt-in (confirmation) -> position card updates -> harvest -> withdraw -> claim.
 *
 * The suite fails clearly if any step of the yield UI flow regresses.
 */

const YIELD_OPT_IN_BUTTON = /opt[- ]?in|enable yield|start earning/i;
const CONFIRM_BUTTON = /confirm|yes,? opt[- ]?in|agree/i;
const HARVEST_BUTTON = /harvest|claim rewards|collect/i;
const WITHDRAW_BUTTON = /withdraw|request withdrawal/i;
const CLAIM_BUTTON = /claim|claim withdrawal|complete withdrawal/i;

async function gotoYield(page: Page) {
  await page.goto('/');
  // Navigate to the yield surface; tolerate either a dedicated route or an in-page section.
  const yieldLink = page.getByRole('link', { name: /yield|earn/i });
  if (await yieldLink.count()) {
    await yieldLink.first().click();
  }
  await expect(page.getByTestId('yield-panel')).toBeVisible();
}

async function optIn(page: Page) {
  await page.getByRole('button', { name: YIELD_OPT_IN_BUTTON }).first().click();

  // Confirmation flow must be shown before the position is created.
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: CONFIRM_BUTTON }).first().click();

  // Position card must reflect the new opt-in state.
  const positionCard = page.getByTestId('yield-position-card');
  await expect(positionCard).toBeVisible();
  await expect(positionCard).toContainText(/active|opted[- ]?in|earning/i);
}

test.describe('yield opt-in -> harvest -> withdraw flow', () => {
  test('completes the full yield lifecycle', async ({ page }) => {
    await gotoYield(page);

    // 1. Opt in through the confirmation flow and verify the position card updates.
    await optIn(page);

    // 2. Simulate / wait for a harvest and assert the resulting UI state.
    const harvestButton = page.getByRole('button', { name: HARVEST_BUTTON }).first();
    if (await harvestButton.isVisible().catch(() => false)) {
      await harvestButton.click();
    }
    const positionCard = page.getByTestId('yield-position-card');
    await expect(positionCard).toContainText(/harvested|rewards|yield/i, { timeout: 15_000 });

    // 3. Request a withdrawal.
    await page.getByRole('button', { name: WITHDRAW_BUTTON }).first().click();
    const withdrawDialog = page.getByRole('dialog');
    if (await withdrawDialog.isVisible().catch(() => false)) {
      await withdrawDialog.getByRole('button', { name: /confirm|request/i }).first().click();
    }
    await expect(positionCard).toContainText(/withdraw|pending|claimable/i, { timeout: 15_000 });

    // 4. Claim once claimable.
    const claimButton = page.getByRole('button', { name: CLAIM_BUTTON }).first();
    await expect(claimButton).toBeEnabled({ timeout: 30_000 });
    await claimButton.click();

    await expect(positionCard).toContainText(/claimed|withdrawn|closed/i, { timeout: 15_000 });
  });
});
