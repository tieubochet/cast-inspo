# CastInspo ✨

**CastInspo** is a Farcaster Frame (Mini App) that turns daily inspiration into on-chain rewards. Users can discover meaningful quotes, share them on Warpcast, and claim daily bonuses on the **Base** network.

![CastInspo Preview](public/img/screenshot.png)

## 🌟 Key Features

### 1. Daily Inspiration
* Displays a random or daily inspirational quote.
* Automatically generates beautiful quote images (using Canvas API) ready for sharing.

### 2. Gamification & Rewards
* **Daily Check-in:** Perform on-chain check-ins daily to earn reward points.
* **Quest Board:** Daily task list (Check-in, Share, Mint) to track progress.
* **User Level:** Leveling system (Novice, Seeker, Inspirator) based on accumulated points.

### 3. NFT Collectibles (Base Chain)
* **Genesis Badge:** Limited edition NFT (100 slots) for Early Adopters.
* **Quote of the Day:** Allows users to Mint their favorite daily quote as a permanent NFT (Open Edition) with dynamic metadata.

## 🛠 Tech Stack

* **Frontend:** React 19, Vite, TypeScript
* **Styling:** Tailwind CSS, Lucide React (Icons)
* **Blockchain & Web3:**
    * Network: **Base Mainnet (8453)**
    * Libraries: `viem`, `@farcaster/frame-sdk`
* **Services:**
    * ImgBB API (storing quote images for sharing)
    * IPFS (storing NFT Metadata)

## 🔗 Smart Contracts

The project currently interacts with the following Smart Contracts on the Base network:

| Contract Name | Address | Description |
| :--- | :--- | :--- |
| **Daily Reward** | `0xcB517c1Ba4587a5192eB8D4f45e1f8617a47a90c` | Handles check-in logic and tracks the last claim day. |
| **Genesis NFT** | `0x831e3158f427eb74a7b02Fa40E40daA1a9111568` | Genesis Badge NFT (Limited to 100 slots). |
| **Daily Quote NFT** | `0x0636503Eb16296bA79Bd4442098095656b0126CE` | Allows minting daily quote images (Dynamic Metadata). |

## 🚀 Installation & Setup

### Prerequisites
* Node.js (v18 or higher)
* ImgBB Account (to get an API Key)

### Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tieubochet/cast-inspo.git
    cd cast-inspo
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and add your key:
    ```env
    VITE_IMGBB_API_KEY=your_imgbb_api_key_here
    ```

4.  **Run Local Development Server:**
    ```bash
    npm run dev
    ```
    Access `http://localhost:5173` to view the app.

## 📱 Deployment

The project is optimized for deployment on **Vercel**.
* Connect your GitHub repository to Vercel.
* Add the `VITE_IMGBB_API_KEY` environment variable in the Vercel Project Settings.

## 📄 License

[MIT License](LICENSE) © 2025 0xteeboo