const fs = require('fs');
const { ethers } = require('ethers');

// Configuration
const RPC_URL = "https://api.zan.top/node/v1/pharos/testnet/0511efd49b7d435599fb3fb2bebb58b7";

// NFT Contract Options
const NFT_CONTRACTS = {
    1: {
        address: "0x1da9f40036bee3fda37ddd9bff624e1125d8991d",
        name: "Original NFT",
        abi: [
            {
                "inputs": [
                    {"internalType": "address", "name": "to", "type": "address"},
                    {"internalType": "uint256", "name": "amount", "type": "uint256"},
                    {"internalType": "address", "name": "token", "type": "address"},
                    {"internalType": "uint256", "name": "price", "type": "uint256"},
                    {"internalType": "bytes", "name": "data1", "type": "bytes"},
                    {"internalType": "bytes", "name": "data2", "type": "bytes"}
                ],
                "name": "mintWithPayment",
                "outputs": [],
                "stateMutability": "payable",
                "type": "function"
            }
        ]
    },
    2: {
        address: "0x7fb63bfd3ef701544bf805e88cb9d2efaa3c01a9",
        name: "FaroSwap Testnet Badge",
        abi: [
            {
                "inputs": [
                    {"internalType": "address", "name": "_receiver", "type": "address"},
                    {"internalType": "uint256", "name": "_quantity", "type": "uint256"},
                    {"internalType": "address", "name": "_currency", "type": "address"},
                    {"internalType": "uint256", "name": "_pricePerToken", "type": "uint256"},
                    {"internalType": "tuple", "name": "_allowlistProof", "type": "tuple",
                     "components": [
                         {"internalType": "bytes32[]", "name": "proof", "type": "bytes32[]"},
                         {"internalType": "uint256", "name": "quantityLimitPerWallet", "type": "uint256"},
                         {"internalType": "uint256", "name": "pricePerToken", "type": "uint256"},
                         {"internalType": "address", "name": "currency", "type": "address"}
                     ]},
                    {"internalType": "bytes", "name": "_data", "type": "bytes"}
                ],
                "name": "claim",
                "outputs": [],
                "stateMutability": "payable",
                "type": "function"
            }
        ]
    }
};

const MINT_COST = ethers.parseEther("1");

class PharosNFTMinter {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(RPC_URL, undefined, {
            polling: true,
            pollingInterval: 3000
        });
        this.privateKeys = [];
        this.wallets = [];
        this.selectedContract = null;
        this.contract = null;
        this.selectedIndex = 0;
    }

    displayHeader() {
        console.clear();
        console.log('');
        console.log('  PHAROS NFT MINTER v2.0');
        console.log('  Professional Edition');
        console.log('');
        console.log('  ================================');
        console.log('');
    }

    displayContractMenu() {
        console.log('  CONTRACT SELECTION');
        console.log('');
        
        // Contract 1
        if (this.selectedIndex === 0) {
            console.log('  ► Original NFT');
            console.log('    0x1da9f40036bee3fda37ddd9bff624e1125d8991d');
        } else {
            console.log('    Original NFT');
            console.log('    0x1da9f40036bee3fda37ddd9bff624e1125d8991d');
        }
        
        console.log('');
        
        // Contract 2
        if (this.selectedIndex === 1) {
            console.log('  ► FaroSwap Testnet Badge');
            console.log('    0x7fb63bfd3ef701544bf805e88cb9d2efaa3c01a9');
        } else {
            console.log('    FaroSwap Testnet Badge');
            console.log('    0x7fb63bfd3ef701544bf805e88cb9d2efaa3c01a9');
        }
        
        console.log('');
        console.log('  Use ↑/↓ arrows to navigate, Enter to select, Ctrl+C to exit');
        console.log('');
    }

    async selectContract() {
        return new Promise((resolve) => {
            const stdin = process.stdin;
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');

            const displayMenu = () => {
                this.displayHeader();
                this.displayContractMenu();
            };

            displayMenu();

            stdin.on('data', (key) => {
                if (key === '\u0003') { // Ctrl+C
                    process.exit();
                }

                if (key === '\u001b[A') { // Up arrow
                    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                    displayMenu();
                } else if (key === '\u001b[B') { // Down arrow
                    this.selectedIndex = Math.min(1, this.selectedIndex + 1);
                    displayMenu();
                } else if (key === '\r') { // Enter
                    this.selectedContract = NFT_CONTRACTS[this.selectedIndex + 1];
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeAllListeners('data');
                    
                    console.log('  ================================');
                    console.log(`  Selected Contract: ${this.selectedContract.name}`);
                    console.log(`  Address: ${this.selectedContract.address}`);
                    console.log('  ================================');
                    console.log('');
                    
                    resolve(true);
                }
            });
        });
    }

    loadPrivateKeys() {
        try {
            const data = fs.readFileSync('privatekeys.txt', 'utf8');
            const keys = data.split('\n').filter(key => key.trim() !== '');
            
            this.privateKeys = keys.map(key => {
                const cleanKey = key.trim();
                return cleanKey.startsWith('0x') ? cleanKey : '0x' + cleanKey;
            });

            console.log('  ================================');
            console.log(`  Private Keys Loaded: ${this.privateKeys.length} wallets`);
            console.log('  ================================');
            console.log('');
            return true;
        } catch (error) {
            console.error('  ================================');
            console.error('  ERROR: Failed to read privatekeys.txt');
            console.error(`  ${error.message}`);
            console.error('  ================================');
            console.log('');
            return false;
        }
    }

    initializeWallets() {
        try {
            this.wallets = this.privateKeys.map(pk => {
                const wallet = new ethers.Wallet(pk, this.provider);
                return wallet;
            });

            this.contract = new ethers.Contract(
                this.selectedContract.address,
                this.selectedContract.abi,
                this.provider
            );

            console.log('  ================================');
            console.log(`  Wallets Initialized: ${this.wallets.length} wallets ready`);
            console.log('  ================================');
            console.log('');
            return true;
        } catch (error) {
            console.error('  ================================');
            console.error('  ERROR: Failed to initialize wallets');
            console.error(`  ${error.message}`);
            console.error('  ================================');
            console.log('');
            return false;
        }
    }

    async getBalance(wallet) {
        try {
            const balance = await this.provider.getBalance(wallet.address);
            return ethers.formatEther(balance);
        } catch (error) {
            return "0";
        }
    }

    async getNonce(wallet) {
        try {
            return await this.provider.getTransactionCount(wallet.address, 'pending');
        } catch (error) {
            return 0;
        }
    }

    displayProgress(current, total, successful, failed) {
        const percentage = Math.round((current / total) * 100);
        const barLength = 30;
        const filled = Math.round((current / total) * barLength);
        const empty = barLength - filled;
        
        const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
        
        console.log('  ================================');
        console.log(`  Progress: [${progressBar}] ${percentage}%`);
        console.log(`  Processed: ${current}/${total} | Successful: ${successful} | Failed: ${failed}`);
        console.log('  ================================');
        console.log('');
    }

    async waitForConfirmation(txHash, timeoutMs = 180000) {
        const startTime = Date.now();
        
        console.log('  ================================');
        console.log('  Waiting for confirmation...');
        console.log(`  Hash: ${txHash}`);
        console.log('  ================================');
        console.log('');
        
        let dots = 0;
        while (Date.now() - startTime < timeoutMs) {
            try {
                const receipt = await this.provider.getTransactionReceipt(txHash);
                
                if (receipt && receipt.status === 1) {
                    console.log('  ================================');
                    console.log('  Transaction Confirmed');
                    console.log(`  Block: ${receipt.blockNumber} | Gas Used: ${receipt.gasUsed}`);
                    console.log('  ================================');
                    console.log('');
                    return true;
                } else if (receipt && receipt.status === 0) {
                    console.log('  ================================');
                    console.log('  Transaction Failed');
                    console.log('  ================================');
                    console.log('');
                    return false;
                }
                
                await this.delay(3000);
                dots = (dots + 1) % 4;
                process.stdout.write(`\r  Confirming${'.'.repeat(dots)}${' '.repeat(3 - dots)}`);
                
            } catch (error) {
                await this.delay(3000);
                dots = (dots + 1) % 4;
                process.stdout.write(`\r  Confirming${'.'.repeat(dots)}${' '.repeat(3 - dots)}`);
            }
        }
        
        console.log('\n  ================================');
        console.log('  Transaction Timeout');
        console.log('  ================================');
        console.log('');
        return false;
    }

    buildTransactionData(wallet) {
        const baseData = "0x84bb1e42" + 
                        wallet.address.slice(2).padStart(64, '0') + 
                        "0000000000000000000000000000000000000000000000000000000000000001" + 
                        "000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" + 
                        "0000000000000000000000000000000000000000000000000de0b6b3a7640000" + 
                        "00000000000000000000000000000000000000000000000000000000000000c0" + 
                        "0000000000000000000000000000000000000000000000000000000000000160" + 
                        "0000000000000000000000000000000000000000000000000000000000000080" + 
                        "0000000000000000000000000000000000000000000000000000000000000000" + 
                        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" + 
                        "0000000000000000000000000000000000000000000000000000000000000000" + 
                        "0000000000000000000000000000000000000000000000000000000000000000" + 
                        "0000000000000000000000000000000000000000000000000000000000000000";
        return baseData;
    }

    async mintNFT(wallet, index, total) {
        try {
            const balance = await this.getBalance(wallet);
            const shortAddress = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
            
            console.log('  ================================');
            console.log(`  Wallet ${index + 1}/${total} | ${shortAddress} | Balance: ${parseFloat(balance).toFixed(4)} PHRS`);
            console.log('  ================================');
            console.log('');

            if (parseFloat(balance) < 1.1) {
                console.log('  STATUS: INSUFFICIENT BALANCE (Required: 1.1 PHRS)');
                console.log('');
                return false;
            }

            const nonce = await this.getNonce(wallet);
            const mintData = this.buildTransactionData(wallet);

            const tx = {
                to: this.selectedContract.address,
                data: mintData,
                value: MINT_COST,
                nonce: nonce,
                gasLimit: 1000000n,
                type: 2,
                maxFeePerGas: 0n,
                maxPriorityFeePerGas: 0n
            };

            console.log('  Broadcasting transaction...');
            console.log('');
            
            const txResponse = await wallet.sendTransaction(tx);
            const success = await this.waitForConfirmation(txResponse.hash, 180000);
            
            if (success) {
                console.log('  STATUS: MINT SUCCESSFUL');
                console.log('');
                return true;
            } else {
                console.log('  STATUS: MINT FAILED');
                console.log('');
                return false;
            }

        } catch (error) {
            console.log('  ================================');
            console.log(`  ERROR: ${error.message}`);
            console.log('  ================================');
            console.log('');
            return false;
        }
    }

    displayFinalResults(successCount, failCount, total) {
        const successRate = ((successCount / total) * 100).toFixed(1);
        const totalCost = successCount;
        
        console.log('');
        console.log('  ================================');
        console.log('  EXECUTION RESULTS');
        console.log('  ================================');
        console.log(`  Contract: ${this.selectedContract.name}`);
        console.log(`  Total Wallets: ${total}`);
        console.log(`  Successful Mints: ${successCount}`);
        console.log(`  Failed Mints: ${failCount}`);
        console.log(`  Success Rate: ${successRate}%`);
        console.log(`  Total Cost: ${totalCost} PHRS`);
        console.log('  ================================');
        console.log('');
    }

    async mintForAllWallets() {
        console.log('  ================================');
        console.log('  STARTING MINT PROCESS');
        console.log('  ================================');
        console.log(`  Contract: ${this.selectedContract.name}`);
        console.log(`  Total Wallets: ${this.wallets.length}`);
        console.log('  Cost per Mint: 1 PHRS');
        console.log(`  Estimated Total Cost: ${this.wallets.length} PHRS`);
        console.log('  ================================');
        console.log('');

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < this.wallets.length; i++) {
            const wallet = this.wallets[i];
            
            this.displayProgress(i, this.wallets.length, successCount, failCount);
            
            const success = await this.mintNFT(wallet, i, this.wallets.length);
            
            if (success) {
                successCount++;
            } else {
                failCount++;
            }

            if (i < this.wallets.length - 1) {
                console.log('  Waiting 10 seconds before next wallet...');
                console.log('');
                await this.delay(10000);
            }
        }

        this.displayProgress(this.wallets.length, this.wallets.length, successCount, failCount);
        this.displayFinalResults(successCount, failCount, this.wallets.length);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async run() {
        const contractSelected = await this.selectContract();
        if (!contractSelected) {
            console.log('  Contract selection cancelled.');
            return;
        }

        console.log('  Initializing system...');
        console.log('');
        
        if (!this.loadPrivateKeys()) {
            return;
        }

        if (!this.initializeWallets()) {
            return;
        }

        try {
            const blockNumber = await this.provider.getBlockNumber();
            console.log('  ================================');
            console.log('  Connected to Pharos Testnet');
            console.log(`  Current Block: ${blockNumber}`);
            console.log('  Minimum Balance Required: 1.1 PHRS per wallet');
            console.log('  ================================');
            console.log('');
        } catch (error) {
            console.error('  ================================');
            console.error('  ERROR: Network connection failed');
            console.error(`  ${error.message}`);
            console.error('  ================================');
            console.log('');
            return;
        }

        await this.mintForAllWallets();
    }
}

async function main() {
    const bot = new PharosNFTMinter();
    await bot.run();
}

process.on('unhandledRejection', (error) => {
    console.error('  ================================');
    console.error('  SYSTEM ERROR: Unhandled promise rejection');
    console.error('  ================================');
    console.error(error);
});

process.on('uncaughtException', (error) => {
    console.error('  ================================');
    console.error('  SYSTEM ERROR: Uncaught exception');
    console.error('  ================================');
    console.error(error);
    process.exit(1);
});

main().catch(console.error);