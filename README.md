# Stow
**Decentralized Savings Platform on Stellar**

Stow is a decentralized savings protocol built on **Stellar using Soroban smart contracts**. It enables individuals and communities to save transparently using stablecoins, with flexible, locked, goal-based, group, and group-split savings mechanisms enforced fully on-chain.

The project solves the problem of opaque, centralized savings platforms in emerging markets by providing a non-custodial, transparent alternative where users maintain full control of their funds and save in a dollar-denominated stablecoin (USDC) as a hedge against local-currency depreciation. Stow is designed for developers, contributors, and financial communities interested in building open, composable savings infrastructure using low-fee, fast-finality blockchain primitives.

---

##  Core Features

- Non-custodial savings via Soroban smart contracts — funds move only under contract rules you can read
- Flexible savings — deposit and withdraw any time
- Locked savings with deterministic, on-chain withdrawal rules
- Goal-based savings with automated milestones
- Group savings pools with shared rules and payouts enforced by the contract, not an organizer
- Group split savings — a group saves into a shared pool and the balance is split back among members by their agreed shares, calculated and settled on-chain
- Dollar-denominated by default — save in USDC, cash in and out in local currency via Stellar anchors
- Passwordless onboarding with passkey smart wallets and sponsored fees
- Web interface for seamless contract interaction
- Detailed savings product reference: `SAVINGS_PRODUCT_REFERENCE.md`


---

## 🔑 Onboarding & On/Off-Ramps

Stow is built so mainstream users never have to touch crypto mechanics:

- **Passkey smart wallets** — accounts are Soroban smart contracts signed with device biometrics (WebAuthn / secp256r1). No seed phrases. Integrate with `passkey-kit` or an OpenZeppelin smart-account SDK.
- **Sponsored (gasless) fees** — a relayer pays transaction fees so users don't need XLM to make their first deposit.
- **Social recovery (optional)** — recovery signers so a lost device doesn't mean lost savings (disclosed as a trust trade-off).
- **Local-currency ramps** — via the SDF Anchor Platform using SEP-24 / SEP-6 for hosted deposit and withdrawal, and SEP-38 for quoted local-currency ↔ USDC conversion. Anchors also handle KYC at the fiat boundary, keeping the protocol layer permissionless.

---

## 🏗 Architecture Overview

- **Frontend (`apps/web`)**  
  Next.js application for interacting with Stow smart contracts. Provides a user interface for creating savings accounts, depositing funds, tracking progress, and onboarding via passkey smart wallets.

- **Backend (`apps/api`)**  
  Node.js API for off-chain services such as indexing contract events, sending notifications, managing user metadata, aggregating analytics, and orchestrating anchor on/off-ramps.

- **Smart Contracts (`contracts/`)**  
  Soroban smart contracts written in Rust that manage all savings logic, fund custody, group rounds, and withdrawal rules. Yield integration lives behind a swappable adapter so the custody core can be audited independently.

### Contract Layout
```text
contracts/
├── vault/          # Solo savings: flexible, locked, goal. Holds USDC. No yield logic.
├── group_pool/     # Group savings & split pools: contributions, payouts, share splits, default handling.
├── yield_adapter/  # OPTIONAL, opt-in. Routes idle balances to an external yield source (swappable).
├── registry/       # Factory + directory of pools/vaults. Emits events for the indexer.
├── fee_collector/  # Transparent, on-chain protocol fees.
└── policy/         # Reusable auth rules (limits, timelocks) shared with the smart-wallet layer.
```

---

## 📁 Repository Structure
```text
/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # Node.js backend API
├── contracts/            # Soroban smart contracts (Rust)
├── packages/             # Shared utilities and types
├── scripts/              # Deployment and automation scripts
├── tests/                # Integration and E2E tests
└── README.md
```

---

## 🛠 Setup Instructions

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** or **yarn** - Comes with Node.js
- **Rust** (stable toolchain) - [Install](https://rustup.rs/)
- **Soroban CLI** - Instructions below
- **Stellar testnet account** - We'll create this in setup

### Installation Overview

1. Clone the repository
2. Set up smart contracts
3. Set up backend API
4. Set up frontend
5. Run tests

---

## 📦 1. Clone the Repository
```bash
git clone https://github.com/your-org/stow.git
cd stow
```

---

## 🔗 2. Smart Contracts Setup (Soroban)

### Install Soroban CLI
```bash
cargo install --locked stellar-cli --features opt
```

Or use the install script:
```bash
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```

Verify installation:
```bash
stellar --version
```

### Configure Stellar Testnet
```bash
stellar network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Generate Identity & Fund Account
```bash
stellar keys generate --global alice --network testnet
```

Get your address:
```bash
stellar keys address alice
```

Fund your account using Friendbot:
```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys address alice)"
```

Verify balance:
```bash
stellar account balance --id alice --network testnet
```

### Build Contracts
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

### Deploy Contracts
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stow_contract.wasm \
  --source alice \
  --network testnet
```

Save the contract ID output - you'll need it for frontend and backend setup.

### Initialize Contract (if required)
```bash
stellar contract invoke \
  --id YOUR_CONTRACT_ID \
  --source alice \
  --network testnet \
  -- initialize \
  --admin $(stellar keys address alice)
```

> **Note:** The admin role's powers are limited and documented in the Trust & Security Model above. It cannot move user principal.

---

## 🖥 3. Backend Setup (Node.js API)
```bash
cd apps/api
npm install
```

### Create Environment File

Create `.env` in `apps/api/`:
```env
PORT=3001
NODE_ENV=development

# Stellar Network
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org

# Contract
CONTRACT_ID=YOUR_DEPLOYED_CONTRACT_ID

# Anchor / on-ramp (SEP-24 hosted deposit/withdraw)
ANCHOR_HOME_DOMAIN=your-anchor-domain
ANCHOR_ASSET_CODE=USDC

# Database (if using)
DATABASE_URL=postgresql://user:password@localhost:5432/stow

# Optional
REDIS_URL=redis://localhost:6379
```

### Run Database Migrations (if applicable)
```bash
npm run migrate
```

### Start Backend Server
```bash
npm run dev
```

Backend should now be running at `http://localhost:3001`

### Verify Backend
```bash
curl http://localhost:3001/health
```

---

## 🌐 4. Frontend Setup (Next.js)
```bash
cd apps/web
npm install
```

### Create Environment File

Create `.env.local` in `apps/web/`:
```env
# Stellar Network
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org

# Contract
NEXT_PUBLIC_CONTRACT_ID=YOUR_DEPLOYED_CONTRACT_ID

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Passkey smart wallet (optional, for passwordless onboarding)
NEXT_PUBLIC_PASSKEY_RELAYER_URL=your_relayer_url
```

### Run Development Server
```bash
npm run dev
```

Frontend should now be running at `http://localhost:3000`

### Build for Production
```bash
npm run build
npm start
```

---

## 🧪 5. Running Tests

### Contract Tests
```bash
cd contracts
cargo test
```

### Backend Tests
```bash
cd apps/api
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

### Frontend Tests
```bash
cd apps/web
npm test
```

Run E2E tests (requires running backend and deployed contracts):
```bash
npm run test:e2e
```

### Integration Tests

From project root:
```bash
npm run test:integration
```

---

## 🌍 Network Configuration

### Testnet

- **Network Passphrase:** `Test SDF Network ; September 2015`
- **RPC URL:** `https://soroban-testnet.stellar.org:443`
- **Horizon URL:** `https://horizon-testnet.stellar.org`
- **Friendbot:** `https://friendbot.stellar.org`

### Contract Addresses (Testnet)

- **Main Savings Contract:** `CXXXXXX...` (Update after deployment)
- **USDC Token:** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

---

## 💼 Business Model

Stow's fees are transparent and on-chain:

- **Performance fee on Tier-1 yield** - a small percentage of yield earned only, never of principal. Stow earns only when users do.
- **Optional pool-creation / per-round fee** for group savings.

No token is required to use Stow. Any future governance mechanism would be introduced only after real usage exists.

---

## 🐛 Troubleshooting

### Contract Deployment Fails

**Error:** `insufficient balance`

**Solution:** Fund your account using Friendbot:
```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys address alice)"
```

### Frontend Can't Connect to Wallet

**Error:** `Failed to connect wallet`

**Solution:**
1. Ensure you have a supported wallet installed (Freighter or a passkey smart wallet)
2. Switch wallet to Testnet network
3. Check that `NEXT_PUBLIC_STELLAR_NETWORK=testnet` in `.env.local`

### Backend Can't Index Events

**Error:** `RPC connection timeout`

**Solution:**
1. Verify RPC URL is correct in `.env`
2. Check Stellar testnet status: https://status.stellar.org
3. Try alternative RPC: `https://soroban-testnet.stellar.org:443`

### Contract Build Fails

**Error:** `wasm32-unknown-unknown target not found`

**Solution:** Add wasm target:
```bash
rustup target add wasm32-unknown-unknown
```

### Tests Failing

**Error:** `Network connection error`

**Solution:** Ensure contracts are deployed and environment variables are set correctly in test config.

---

## 📚 Documentation & Resources

- **Stellar Documentation:** [developers.stellar.org](https://developers.stellar.org/docs/build/smart-contracts)
- **Soroban Docs:** [developers.stellar.org/docs/build/smart-contracts](https://developers.stellar.org/docs/build/smart-contracts)
- **Anchors & On/Off-Ramps:** [developers.stellar.org/docs/learn/fundamentals/anchors](https://developers.stellar.org/docs/learn/fundamentals/anchors)
- **Passkey Smart Wallets:** [github.com/stellar/passkey-kit](https://github.com/stellar/passkey-kit)
- **Soroban Examples:** [github.com/stellar/soroban-examples](https://github.com/stellar/soroban-examples)

---

## 🤝 Contributing

See our detailed [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards (Rust/Soroban, TypeScript), Git workflow, naming conventions, and full PR process.

---


### Future
- Additional anchors & cash on/off-ramps
- More yield venues behind the adapter
- Mobile app (Flutter)
- Progressive decentralization (timelock → community input)
- Cross-chain savings
- Advanced analytics dashboard

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Handsoff notes

<!-- handsoff-issue-302 -->
- #302: [Frontend] — Yield settings in preferences page
