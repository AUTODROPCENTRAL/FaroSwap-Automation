# FaroSwap Automation Bot

Bot otomatisasi untuk berinteraksi dengan **Pharos Protocol Testnet**.  
Dirancang untuk mengotomatisasi berbagai tugas harian seperti **Swap**, **Add Liquidity**, dan **Kirim PHRS**, untuk **multi-akun** dengan dukungan rotasi proxy dan siklus otomatis 24 jam.

> Repositori Resmi: [AUTODROPCENTRAL/FaroSwap-Automation](https://github.com/AUTODROPCENTRAL/FaroSwap-Automation)

---

## ✨ Fitur Utama

- **Otomatisasi Multi-Akun**  
  Menjalankan semua tugas untuk setiap private key di `privatekeys.txt`.

- **Auto Swap**  
  Melakukan swap otomatis antara PHRS ⇄ USDT.

- **Auto Add Liquidity**  
  Menambahkan likuiditas ke pool WPHRS/USDT secara otomatis.

- **Auto Send PHRS**  
  Mengirim PHRS dalam jumlah acak ke alamat di `wallet.txt`.

- **Auto Daily Check-In**  
  Check-in harian di DApp Pharos secara otomatis.

- **Dukungan Proxy**  
  Mendukung proxy HTTP/SOCKS5, satu per akun dengan rotasi otomatis saat gagal.

- **Konfigurasi Fleksibel**  
  Atur jumlah repetisi tiap tugas dengan mudah di `config.json`.

- **Siklus 24 Jam**  
  Setelah seluruh akun selesai diproses, bot akan menunggu 24 jam sebelum mengulang.

- **Minting NFT**
  Mint 2 Nft Original And FaroSwap di
  `minting.js`

---

## ⚙️ Pengaturan & Instalasi

### 1. Prasyarat

Pastikan Anda sudah menginstal:

- [Node.js](https://nodejs.org/) v16 atau lebih tinggi
- NPM (sudah termasuk dalam Node.js)

### 2. Kloning Repositori

```bash
git clone https://github.com/AUTODROPCENTRAL/FaroSwap-Automation.git
cd FaroSwap-Automation
````

### 3. Instalasi Dependensi

```bash
npm install
```

### 4. Konfigurasi File

Buat beberapa file berikut di direktori utama:

#### `privatekeys.txt`

Daftar private key Anda, satu per baris:

```
0x...privatekey1
0x...privatekey2
```

#### `proxy.txt` (Opsional)

Daftar proxy (satu baris per proxy):

```
http://user:pass@host:port
socks5://user:pass@host:port
```

#### `wallet.txt` (Opsional)

Diperlukan untuk fitur **Auto Send PHRS**. Satu alamat per baris:

```
0x...address1
0x...address2
```

#### `config.json`

Atur jumlah repetisi tugas:

```json
{
  "swapRepetitions": 10,
  "sendPhrsRepetitions": 10,
  "addLiquidityRepetitions": 10
}
```

---

## 🚀 Menjalankan Bot

Setelah konfigurasi siap, jalankan:

```bash
node main.js
```

Bot akan:

* Menampilkan logo FaroSwap di terminal
* Memuat konfigurasi dan akun
* Menjalankan semua fitur sesuai pengaturan

---

Dibuat dengan ❤️ oleh [AUTODROPCENTRAL](https://github.com/AUTODROPCENTRAL)


