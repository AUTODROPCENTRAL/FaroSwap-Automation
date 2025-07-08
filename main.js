import chalk from "chalk";
import { ethers } from "ethers";
import fs from "fs";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

// ================== KONFIGURASI ==================
const RPC_URL = "https://testnet.dplabs-internal.com";
const PHRS_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WPHRS_ADDRESS = "0x3019b247381c850ab53dc0ee53bce7a07ea9155f";
const USDT_ADDRESS = "0xd4071393f8716661958f766df660033b3d35fd29";
const ROUTER_ADDRESS = "0x3541423f25a1ca5c98fdbcf478405d3f0aad1164";
const LP_ADDRESS = "0x4b177aded3b8bd1d5d747f91b9e853513838cd49";
const API_BASE_URL = "https://api.pharosnetwork.xyz";
const FAUCET_USDT_URL = "https://testnet-router.zenithswap.xyz/api/v1/faucet";
const CONFIG_FILE = "config.json";
const PRIVATE_KEY_FILE = "privatekeys.txt"; // Nama file diubah sesuai permintaan
const PROXY_FILE = "proxy.txt";
const WALLET_FILE = "wallet.txt";
const isDebug = false;

// ================== VARIABEL GLOBAL ==================
let privateKeys = [];
let proxies = [];
let nonceTracker = {};
let accountJwts = {};
let dailyActivityInterval = null;

let dailyActivityConfig = {
    swapRepetitions: 10,
    sendPhrsRepetitions: 10,
    addLiquidityRepetitions: 10
};

// ================== ABI KONTRAK ==================
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const ROUTER_ABI = [
    "function mixSwap(address fromToken, address toToken, uint256 fromAmount, uint256 resAmount, uint256 minReturnAmount, address[] memory proxyList, address[] memory poolList, address[] memory routeList, uint256 direction, bytes[] memory moreInfos, uint256 deadLine) external payable returns (uint256)"
];

const LP_ABI = [
    "function addDVMLiquidity(address dvmAddress, uint256 baseInAmount, uint256 quoteInAmount, uint256 baseMinAmount, uint256 quoteMinAmount, uint8 flag, uint256 deadLine) external payable returns (uint256, uint256, uint256)"
];


// ================== FUNGSI UTILITAS ==================

/**
 * Menampilkan log ke konsol dengan timestamp dan warna.
 * @param {string} message - Pesan log.
 * @param {string} type - Tipe log (info, success, error, wait, debug).
 * @param {boolean} noTimestamp - Jika true, tidak akan menampilkan timestamp.
 */
function addLog(message, type = "info", noTimestamp = false) {
    if (type === "debug" && !isDebug) return;
    const timestamp = new Date().toLocaleTimeString("id-ID", { hour12: false, timeZone: "Asia/Jakarta" });
    let coloredMessage;
    switch (type) {
        case "error":
            coloredMessage = chalk.red(message);
            break;
        case "success":
            coloredMessage = chalk.green(message);
            break;
        case "wait":
            coloredMessage = chalk.yellow(message);
            break;
        case "debug":
            coloredMessage = chalk.blue(message);
            break;
        default:
            coloredMessage = chalk.white(message);
    }
    if (noTimestamp) {
        console.log(coloredMessage);
    } else {
        console.log(`[${chalk.gray(timestamp)}] ${coloredMessage}`);
    }
}

/**
 * Menunda eksekusi selama durasi tertentu.
 * @param {number} ms - Durasi dalam milidetik.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mendapatkan nama token dari alamatnya.
 */
function getTokenName(tokenAddress) {
    if (tokenAddress === PHRS_ADDRESS) return "PHRS";
    if (tokenAddress === WPHRS_ADDRESS) return "WPHRS";
    if (tokenAddress === USDT_ADDRESS) return "USDT";
    return "Unknown";
}

/**
 * Mendapatkan alamat yang dipersingkat.
 */
function getShortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

/**
 * Mendapatkan hash transaksi yang dipersingkat.
 */
function getShortHash(hash) {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/**
 * Memuat konfigurasi dari file config.json.
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, "utf8");
            const config = JSON.parse(data);
            dailyActivityConfig.swapRepetitions = Number(config.swapRepetitions) || 10;
            dailyActivityConfig.sendPhrsRepetitions = Number(config.sendPhrsRepetitions) || 10;
            dailyActivityConfig.addLiquidityRepetitions = Number(config.addLiquidityRepetitions) || 10;
            const configLog = `Konfigurasi Aktif:\n         • Auto Swap    : ${dailyActivityConfig.swapRepetitions}\n         • Auto Send PHRS: ${dailyActivityConfig.sendPhrsRepetitions}\n         • Auto Add LP    : ${dailyActivityConfig.addLiquidityRepetitions}`;
            addLog(configLog, "success");
        } else {
            addLog("File config.json tidak ditemukan, menggunakan pengaturan default.", "info");
        }
    } catch (error) {
        addLog(`Gagal memuat config: ${error.message}, menggunakan pengaturan default.`, "error");
    }
}

/**
 * Memuat private key dari file privatekeys.txt.
 */
function loadPrivateKeys() {
    try {
        addLog(`Memuat private key dari: ${PRIVATE_KEY_FILE}`);
        const data = fs.readFileSync(PRIVATE_KEY_FILE, "utf8");
        privateKeys = data.split("\n").map(key => key.trim()).filter(key => key.match(/^(0x)?[0-9a-fA-F]{64}$/));
        if (privateKeys.length === 0) throw new Error(`Tidak ada private key yang valid di ${PRIVATE_KEY_FILE}`);
        addLog(`Total key ditemukan: ${privateKeys.length}`, "success");
    } catch (error) {
        addLog(`Gagal memuat private key: ${error.message}`, "error");
        privateKeys = [];
    }
}

/**
 * Memuat proxy dari file proxy.txt.
 */
function loadProxies() {
    try {
        if (fs.existsSync(PROXY_FILE)) {
            const data = fs.readFileSync(PROXY_FILE, "utf8");
            proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
            if (proxies.length > 0) {
                addLog(`Memuat ${proxies.length} proxy dari ${PROXY_FILE}`, "success");
            } else {
                addLog("File proxy.txt kosong, berjalan tanpa proxy.", "warn");
            }
        } else {
            addLog(`File ${PROXY_FILE} tidak ditemukan. Bot berjalan tanpa proxy.`, "warn");
        }
    } catch (error) {
        addLog(`Gagal memuat proxy: ${error.message}`, "error");
        proxies = [];
    }
}

/**
 * Memuat alamat wallet untuk transfer dari wallet.txt.
 */
function loadWalletAddresses() {
    try {
        if (fs.existsSync(WALLET_FILE)) {
            const data = fs.readFileSync(WALLET_FILE, "utf8");
            const addresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
            if (addresses.length === 0) throw new Error(`Tidak ada alamat yang valid di ${WALLET_FILE}`);
            addLog(`Memuat ${addresses.length} alamat wallet dari ${WALLET_FILE}`, "success");
            return addresses;
        }
        addLog(`File ${WALLET_FILE} tidak ditemukan, melewati transfer PHRS.`, "warn");
        return [];
    } catch (error) {
        addLog(`Gagal memuat alamat wallet: ${error.message}`, "warn");
        return [];
    }
}


// ================== FUNGSI KONEKSI & API ==================

function createAgent(proxyUrl) {
    if (!proxyUrl) return null;
    return proxyUrl.startsWith("socks") ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
}

function getProviderWithProxy(proxyUrl) {
    const agent = createAgent(proxyUrl);
    const fetchOptions = agent ? { agent } : {};
    return new ethers.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "Pharos Testnet" }, { fetchOptions });
}

async function makeApiRequest(method, url, data, proxyUrl, customHeaders = {}, maxRetries = 3, retryDelay = 2000) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const agent = proxyUrl ? createAgent(proxyUrl) : null;
            const headers = {
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Origin": "https://testnet.pharosnetwork.xyz",
                "Referer": "https://testnet.pharosnetwork.xyz/",
                ...customHeaders
            };
            const config = {
                method,
                url,
                data,
                headers,
                ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
                timeout: 10000
            };
            const response = await axios(config);
            return response.data;
        } catch (error) {
            lastError = error;
            let errorMessage = `API Request Gagal (Percobaan ${attempt}/${maxRetries}) ke ${url}`;
            if (error.response) errorMessage += `: HTTP ${error.response.status} - ${JSON.stringify(error.response.data || error.response.statusText)}`;
            else if (error.request) errorMessage += `: Tidak ada respons diterima`;
            else errorMessage += `: ${error.message}`;
            addLog(errorMessage, "error");
            if (attempt < maxRetries) {
                addLog(`Mencoba lagi dalam ${retryDelay/1000} detik...`, "wait");
                await sleep(retryDelay);
            }
        }
    }
    throw new Error(`Gagal membuat permintaan API ke ${url} setelah ${maxRetries} percobaan: ${lastError.message}`);
}

// ================== FUNGSI INTI BLOCKCHAIN ==================

async function getNextNonce(provider, walletAddress) {
    try {
        const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
        const lastUsedNonce = nonceTracker[walletAddress] || pendingNonce - 1;
        const nextNonce = Math.max(pendingNonce, lastUsedNonce + 1);
        nonceTracker[walletAddress] = nextNonce;
        return nextNonce;
    } catch (error) {
        addLog(`Error mengambil nonce untuk ${getShortAddress(walletAddress)}: ${error.message}`, "error");
        throw error;
    }
}

async function checkAndApproveToken(wallet, provider, tokenAddress, amount, tokenName, accountIndex, count, type = "swap") {
    try {
        const signer = new ethers.Wallet(wallet.privateKey, provider);
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const balance = await token.balanceOf(signer.address);
        if (balance < amount) {
            addLog(`[${type.toUpperCase()} ${count}] Saldo ${tokenName} tidak cukup (${ethers.formatEther(balance)})`, "error");
            return false;
        }
        const targetAddress = type === "swap" ? ROUTER_ADDRESS : LP_ADDRESS;
        const allowance = await token.allowance(signer.address, targetAddress);
        if (allowance < amount) {
            addLog(`[${type.toUpperCase()} ${count}] Menyetujui (approving) ${tokenName}...`, "info");
            const nonce = await getNextNonce(provider, signer.address);
            const feeData = await provider.getFeeData();
            const tx = await token.approve(targetAddress, ethers.MaxUint256, {
                gasLimit: 300000,
                maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
                nonce
            });
            addLog(`[${type.toUpperCase()} ${count}] Approval dikirim. Hash: ${getShortHash(tx.hash)}`, "success");
            await tx.wait();
        }
        return true;
    } catch (error) {
        addLog(`[${type.toUpperCase()} ${count}] Error saat approve ${tokenName}: ${error.message}`, "error");
        return false;
    }
}

async function getDodoRoute(fromToken, toToken, fromAmount, userAddr, proxyUrl) {
    const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=688688&deadLine=${Math.floor(Date.now() / 1000) + 600}&apikey=a37546505892e1a952&slippage=10.401&source=dodoV2AndMixWasm&toTokenAddress=${toToken}&fromTokenAddress=${fromToken}&userAddr=${userAddr}&estimateGas=false&fromAmount=${fromAmount}`;
    try {
        const response = await makeApiRequest("get", url, null, proxyUrl);
        if (response && response.status === 200 && response.data) {
            return response.data;
        }
        addLog(`Gagal mendapatkan rute Dodo: ${response ? response.message || JSON.stringify(response) : 'No response'}`, "error");
        return null;
    } catch (error) {
        addLog(`Error mendapatkan rute Dodo: ${error.message}`, "error");
        return null;
    }
}

async function executeSwap(wallet, provider, swapCount, totalSwaps, fromToken, toToken, amount, accountIndex, proxyUrl) {
    const fromTokenName = getTokenName(fromToken);
    const toTokenName = getTokenName(toToken);
    addLog(`[Swap ${swapCount}/${totalSwaps}] Menyiapkan swap ${amount} ${fromTokenName} ke ${toTokenName}...`, "info");

    try {
        const signer = new ethers.Wallet(wallet.privateKey, provider);
        const userAddr = signer.address;
        const decimals = fromToken === PHRS_ADDRESS ? 18 : 6;
        const fromAmount = ethers.parseUnits(amount.toString(), decimals);

        const routeData = await getDodoRoute(fromToken, toToken, fromAmount, userAddr, proxyUrl);
        if (!routeData) {
            addLog(`[Swap ${swapCount}/${totalSwaps}] Gagal mendapatkan data rute`, "error");
            return false;
        }

        if (fromToken !== PHRS_ADDRESS) {
            const isApproved = await checkAndApproveToken(wallet, provider, fromToken, fromAmount, fromTokenName, accountIndex, `${swapCount}/${totalSwaps}`, "swap");
            if (!isApproved) return false;
        }

        const nonce = await getNextNonce(provider, signer.address);
        const feeData = await provider.getFeeData();
        const tx = {
            to: routeData.to,
            data: routeData.data,
            value: routeData.value ? ethers.parseUnits(routeData.value, "wei") : 0,
            gasLimit: 500000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("5", "gwei"),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
            nonce
        };

        const sentTx = await signer.sendTransaction(tx);
        addLog(`[Swap ${swapCount}/${totalSwaps}] Transaksi dikirim\n         TX Hash: ${getShortHash(sentTx.hash)}`, "success");
        await sentTx.wait();
        addLog(`[Swap ${swapCount}/${totalSwaps}] Konfirmasi diterima — Swap selesai`, "success");
        return true;
    } catch (error) {
        addLog(`[Swap ${swapCount}/${totalSwaps}] Gagal: ${error.message}`, "error");
        return false;
    }
}

async function performLiquidityAddition(wallet, provider, lpCount, totalLps, accountIndex, proxyUrl) {
    addLog(`[LP ${lpCount}/${totalLps}] Menyiapkan penambahan likuiditas...`, "info");
    try {
        const signer = new ethers.Wallet(wallet.privateKey, provider);
        const lpRouter = new ethers.Contract(LP_ADDRESS, LP_ABI, signer);

        const baseInAmount = ethers.parseUnits("0.001999999667913912", 18);
        const quoteInAmount = ethers.parseUnits("0.902065", 6);
        const baseMinAmount = ethers.parseUnits("0.0019", 18);
        const quoteMinAmount = ethers.parseUnits("0.85", 6);
        const deadLine = Math.floor(Date.now() / 1000) + 600;
        const dvmAddress = "0x034c1f84eb9d56be15fbd003e4db18a988c0d4c6";

        const isBaseApproved = await checkAndApproveToken(wallet, provider, WPHRS_ADDRESS, baseInAmount, "WPHRS", accountIndex, `${lpCount}/${totalLps}`, "LP");
        if (!isBaseApproved) return false;
        const isQuoteApproved = await checkAndApproveToken(wallet, provider, USDT_ADDRESS, quoteInAmount, "USDT", accountIndex, `${lpCount}/${totalLps}`, "LP");
        if (!isQuoteApproved) return false;

        const nonce = await getNextNonce(provider, signer.address);
        const feeData = await provider.getFeeData();
        const tx = await lpRouter.addDVMLiquidity(
            dvmAddress, baseInAmount, quoteInAmount, baseMinAmount, quoteMinAmount, 0, deadLine, {
                gasLimit: 600000,
                maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("5", "gwei"),
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
                nonce
            }
        );

        addLog(`[LP ${lpCount}/${totalLps}] Menambah likuiditas WPHRS/USDT...\n         TX Hash: ${getShortHash(tx.hash)}`, "success");
        await tx.wait();
        addLog(`[LP ${lpCount}/${totalLps}] Likuiditas berhasil ditambahkan`, "success");
        return true;
    } catch (error) {
        addLog(`[LP ${lpCount}/${totalLps}] Gagal menambah likuiditas: ${error.message}`, "error");
        return false;
    }
}

async function loginAccount(wallet, proxyUrl) {
    try {
        const message = "pharos";
        const signature = await wallet.signMessage(message);
        const loginUrl = `${API_BASE_URL}/user/login?address=${wallet.address}&signature=${signature}`;
        const loginResponse = await makeApiRequest("post", loginUrl, {}, proxyUrl);

        if (loginResponse.code === 0) {
            accountJwts[wallet.address] = loginResponse.data.jwt;
            addLog(`Status: Berhasil login`, "success");
            return true;
        } else {
            addLog(`Status: Gagal login - ${loginResponse.msg}`, "error");
            return false;
        }
    } catch (error) {
        addLog(`Status: Error saat login - ${error.message}`, "error");
        return false;
    }
}

async function reportTransaction(walletAddress, txHash, proxyUrl) {
    try {
        const url = `https://api.pharosnetwork.xyz/task/verify?address=${walletAddress}&task_id=103&tx_hash=${txHash}`;
        addLog(`Melaporkan Transaksi untuk ${getShortAddress(walletAddress)}`, "info");
        const headers = {
            "authorization": `Bearer ${accountJwts[walletAddress]}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        };
        const response = await makeApiRequest("post", url, null, proxyUrl, headers, 5, 10000);

        if (response.code === 0 && response.data?.verified) {
            addLog(`Transaksi berhasil dilaporkan`, "success");
        } else {
            addLog(`Gagal melaporkan transaksi: ${response.msg || 'Error tidak diketahui'}`, "error");
        }
    } catch (error) {
        addLog(`Gagal melaporkan transaksi setelah beberapa kali percobaan: ${error.message}`, "error");
    }
}


// ================== FUNGSI UTAMA OTOMATISASI ==================

async function runDailyActivity() {
    addLog(`Wallet terdeteksi: ${privateKeys.length}`, "info");
    addLog(`Memulai proses harian untuk seluruh akun...`, "info");

    for (let accountIndex = 0; accountIndex < privateKeys.length; accountIndex++) {
        addLog(`\n------------------------------------------------------------`, "info", true);
        addLog(`>> Proses Akun ${accountIndex + 1} dari ${privateKeys.length}`);
        const proxyUrl = proxies.length > 0 ? proxies[accountIndex % proxies.length] : null;
        let provider;

        addLog(`Proxy: ${proxyUrl || "none"}`);
        try {
            provider = getProviderWithProxy(proxyUrl);
            await provider.getNetwork();
        } catch (error) {
            addLog(`Gagal terhubung ke provider: ${error.message}`, "error");
            continue; // Lanjut ke akun berikutnya
        }

        const wallet = new ethers.Wallet(privateKeys[accountIndex], provider);
        addLog(`Wallet: ${getShortAddress(wallet.address)}`);
        const loginSuccess = await loginAccount(wallet, proxyUrl);
        if (!loginSuccess) {
            addLog(`Melewati aktivitas harian karena gagal login.`, "error");
            continue;
        }

        // --- Proses Swap ---
        let successfulSwaps = 0;
        for (let attempt = 1; attempt <= dailyActivityConfig.swapRepetitions; attempt++) {
            const isPHRSToUSDT = attempt % 2 === 1;
            const fromToken = isPHRSToUSDT ? PHRS_ADDRESS : USDT_ADDRESS;
            const toToken = isPHRSToUSDT ? USDT_ADDRESS : PHRS_ADDRESS;
            let amount = fromToken === PHRS_ADDRESS
                ? (Math.random() * (0.004 - 0.001) + 0.001).toFixed(4)
                : (Math.random() * (10 - 5) + 5).toFixed(4);
            const swapSuccess = await executeSwap(wallet, provider, attempt, dailyActivityConfig.swapRepetitions, fromToken, toToken, amount, accountIndex, proxyUrl);
            if (swapSuccess) {
                successfulSwaps++;
                if (attempt < dailyActivityConfig.swapRepetitions) {
                    const randomDelay = Math.floor(Math.random() * (30000 - 15000 + 1)) + 15000;
                    addLog(`Delay ${Math.floor(randomDelay / 1000)} detik sebelum melanjutkan swap berikutnya...`, "wait");
                    await sleep(randomDelay);
                }
            } else {
                addLog(`Percobaan swap ${attempt}: Gagal, lanjut ke swap berikutnya`, "error");
            }
        }
        addLog(`Selesai ${successfulSwaps} swap berhasil.`, "success");

        // --- Proses Add Liquidity ---
        let successfulLPs = 0;
        for (let attempt = 1; attempt <= dailyActivityConfig.addLiquidityRepetitions; attempt++) {
            const lpSuccess = await performLiquidityAddition(wallet, provider, attempt, dailyActivityConfig.addLiquidityRepetitions, accountIndex, proxyUrl);
            if (lpSuccess) {
                successfulLPs++;
                 if (attempt < dailyActivityConfig.addLiquidityRepetitions) {
                    const randomDelay = Math.floor(Math.random() * (30000 - 15000 + 1)) + 15000;
                    addLog(`Delay ${Math.floor(randomDelay / 1000)} detik sebelum melanjutkan LP berikutnya...`, "wait");
                    await sleep(randomDelay);
                }
            } else {
                addLog(`Percobaan LP ${attempt}: Gagal, lanjut ke LP berikutnya`, "error");
            }
        }
        addLog(`Selesai ${successfulLPs} penambahan LP berhasil.`, "success");

        // --- Proses Transfer PHRS ---
        const addresses = loadWalletAddresses();
        let successfulTransfers = 0;
        if (addresses.length > 0) {
            for (let i = 0; i < dailyActivityConfig.sendPhrsRepetitions; i++) {
                let recipient;
                do {
                    recipient = addresses[Math.floor(Math.random() * addresses.length)];
                } while (recipient.toLowerCase() === wallet.address.toLowerCase());
                
                const amount = ethers.parseEther((Math.random() * (0.0002 - 0.0001) + 0.0001).toFixed(6));
                try {
                    const balance = await provider.getBalance(wallet.address);
                    if (balance < amount) {
                        addLog(`Saldo PHRS tidak cukup untuk transfer`, "error");
                        break; // Keluar dari loop transfer jika saldo tidak cukup
                    }
                    addLog(`[Send ${i+1}/${dailyActivityConfig.sendPhrsRepetitions}] Mengirim ${ethers.formatEther(amount)} PHRS ke ${getShortAddress(recipient)}...`, "info");
                    const feeData = await provider.getFeeData();
                    const tx = await wallet.sendTransaction({
                        to: recipient,
                        value: amount,
                        gasLimit: 21000,
                        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
                        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
                        nonce: await getNextNonce(provider, wallet.address)
                    });
                    addLog(`[Send ${i+1}/${dailyActivityConfig.sendPhrsRepetitions}] Transaksi terkirim.\n         TX Hash: ${getShortHash(tx.hash)}`, "success");
                    await tx.wait();
                    successfulTransfers++;
                    await reportTransaction(wallet.address, tx.hash, proxyUrl);
                    await sleep(5000); // Tunggu sebentar sebelum transfer berikutnya
                } catch (error) {
                    addLog(`[Send ${i+1}/${dailyActivityConfig.sendPhrsRepetitions}] Gagal mengirim PHRS ke ${getShortAddress(recipient)}: ${error.message}`, "error");
                }
            }
            addLog(`Selesai ${successfulTransfers} transfer PHRS berhasil.`, "success");
        }

        // --- Proses Check-in Harian ---
        if (accountJwts[wallet.address]) {
            try {
                const checkinUrl = `${API_BASE_URL}/sign/in?address=${wallet.address}`;
                const checkinResponse = await makeApiRequest("post", checkinUrl, {}, proxyUrl, { "Authorization": `Bearer ${accountJwts[wallet.address]}` });
                if (checkinResponse.code === 0) {
                    addLog(`Check-in harian berhasil.`, "success");
                } else {
                    addLog(`Gagal check-in: ${checkinResponse.msg}`, "error");
                }
            } catch (error) {
                addLog(`Error saat check-in: ${error.message}`, "error");
            }
        }
        
        if (accountIndex < privateKeys.length - 1) {
            addLog(`\nMenunggu 60 detik sebelum lanjut ke akun berikutnya...`, "wait", true);
        }
    }

    addLog("\nSemua akun telah diproses. Menunggu 24 jam untuk siklus berikutnya.", "success", true);
    dailyActivityInterval = setTimeout(runDailyActivity, 24 * 60 * 60 * 1000);
}

/**
 * Fungsi utama untuk memulai bot.
 */
async function main() {
    const asciiArt = `
\n███████╗ █████╗ ██████╗  ██████╗      ███████╗██╗    ██╗ █████╗ ██████╗ 
██╔════╝██╔══██╗██╔══██╗██╔═══██╗     ██╔════╝██║    ██║██╔══██╗██╔══██╗
█████╗  ███████║██████╔╝██║   ██║     ███████╗██║ █╗ ██║███████║██████╔╝
██╔══╝  ██╔══██║██╔══██╗██║   ██║     ╚════██║██║███╗██║██╔══██║██╔═══╝ 
██║     ██║  ██║██║  ██║╚██████╔╝    ███████║╚██ █╔█ ██╔██║  ██║██║     
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝     
                                                 @BYAUTODROPCENTRAL
`;
    console.log(chalk.cyan(asciiArt));
    console.log(chalk.cyan("============================================================"));
    console.log(chalk.cyan("              FAROSWAP AUTOMATION BOT v1.0                  "));
    console.log(chalk.cyan("============================================================\n"));


    loadConfig();
    loadPrivateKeys();
    loadProxies();

    if (privateKeys.length === 0) {
        addLog(`Tidak ada private key ditemukan di ${PRIVATE_KEY_FILE}. Bot berhenti.`, "error");
        process.exit(1);
    }

    // Menjalankan proses utama
    await runDailyActivity();
}

// Menangani error yang tidak tertangkap
process.on("unhandledRejection", (reason, promise) => {
    addLog(`Unhandled Rejection: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
    addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
    process.exit(1);
});

// Menjalankan fungsi utama
main().catch(error => {
    addLog(`Terjadi kesalahan kritis: ${error.message}`, "error");
    console.error(error);
    process.exit(1);
});
