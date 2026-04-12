const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ========== CẢI TIẾN THUẬT TOÁN V6.1 - PHÁ CẦU & ỔN ĐỊNH ==========
let predictionHistory = [];   
let consecutive_losses = 0;

function getAdvancedPrediction() {
    if (predictionHistory.length < 5) {
        return {
            du_doan: "Xỉu",
            do_tin_cay: 60,
            xac_suat_tai: 50,
            xac_suat_xiu: 50,
            phuong_phap: "Đang thu thập dữ liệu..."
        };
    }

    const recent = predictionHistory.slice(0, 12);
    const results = recent.map(r => r.Ket_qua);

    let chain = 1;
    const last = results[0];
    for (let i = 1; i < results.length; i++) {
        if (results[i] === last) chain++;
        else break;
    }

    let du_doan, do_tin_cay, phuong_phap;

    if (chain >= 7) {
        du_doan = last === "Tài" ? "Xỉu" : "Tài";
        do_tin_cay = 92;
        phuong_phap = `Cầu bệt cực đại (${chain} tay) - Ép bẻ`;
    } 
    else if (chain >= 5) {
        du_doan = last === "Tài" ? "Xỉu" : "Tài";
        do_tin_cay = 85;
        phuong_phap = `Bẻ cầu dài (${chain} tay)`;
    } 
    else if (consecutive_losses >= 3) {
        du_doan = last === "Tài" ? "Xỉu" : "Tài";
        do_tin_cay = 80;
        phuong_phap = "Thuật toán cứu thua (Loss Recovery)";
    } 
    else if (chain >= 3) {
        du_doan = last;
        do_tin_cay = 75;
        phuong_phap = `Bám cầu bệt (${chain} tay)`;
    } 
    else {
        let isZigzag = true;
        for (let i = 1; i < Math.min(5, results.length); i++) {
            if (results[i] === results[i-1]) {
                isZigzag = false;
                break;
            }
        }
        if (isZigzag && results.length >= 4) {
            du_doan = last === "Tài" ? "Xỉu" : "Tài";
            do_tin_cay = 78;
            phuong_phap = "Bám cầu 1-1 (Zigzag)";
        } else {
            du_doan = last === "Tài" ? "Xỉu" : "Tài";
            do_tin_cay = 68;
            phuong_phap = "Cầu đảo đối xứng";
        }
    }

    do_tin_cay = Math.min(95, Math.max(55, Math.round(do_tin_cay)));

    return {
        du_doan,
        do_tin_cay,
        xac_suat_tai: du_doan === "Tài" ? do_tin_cay : 100 - do_tin_cay,
        xac_suat_xiu: du_doan === "Xỉu" ? do_tin_cay : 100 - do_tin_cay,
        phuong_phap,
        lich_su_gan_nhat: results.slice(0, 10)
    };
}

// ========== DATA RESPONSE STRUCTURE ==========
let apiResponseData = {
    Phien: null,
    Xuc_xac: [0, 0, 0],
    Tong: null,
    Ket_qua: "",
    Du_doan: "Đang chờ dữ liệu...",
    Do_tin_cay: "0%",
    Phien_du_doan: null,
    Xac_suat: { Tai: "50%", Xiu: "50%" },
    Phuong_phap: "Đang khởi tạo...",
    Lich_su: [],
    Thong_ke: { tong_du_doan: 0, dung: 0, sai: 0, ti_le_dung: "0%" },
    timestamp: null,
    author: "@AnhTuấnMMO"
};

let currentSessionId = null;

// CẬP NHẬT WEBSOCKET URL MỚI CỦA BẠN VÀO ĐÂY
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/wsbinary?token=TOKEN_MOI_CUA_BAN";

const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Origin": "https://web.sunwin.ec/?affId=Sunwin"
};

let ws = null;
let pingInterval = null;

function connectWebSocket() {
    console.log('[🔌] Đang kết nối Sunwin...');
    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket đã mở!');
        
        // Gửi lệnh đăng ký MiniGame
        const initCmds = [
            [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
            [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
        ];

        initCmds.forEach((cmd, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(cmd));
                    console.log(`[📤] Đã gửi lệnh khởi tạo ${i+1}`);
                }
            }, 1500 * (i + 1));
        });

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 15000);
    });

    ws.on('message', (data) => {
        try {
            const msgString = data.toString();
            // Log dữ liệu để bạn kiểm tra trong bảng điều khiển (Console)
            // console.log("[📩] Data:", msgString); 

            const json = JSON.parse(msgString);
            if (!Array.isArray(json)) return;

            const payload = json[1];
            if (!payload) return;

            // Cập nhật mã phiên (sid)
            if (payload.sid && payload.cmd === 1008) {
                currentSessionId = payload.sid;
            }

            // Xử lý khi có kết quả (cmd 1003)
            if (payload.cmd === 1003 && payload.d1 !== undefined) {
                const { d1, d2, d3 } = payload;
                const total = d1 + d2 + d3;
                const result = total >= 11 ? "Tài" : "Xỉu";

                // Lưu lịch sử
                predictionHistory.unshift({ Phien: currentSessionId, Ket_qua: result });
                if (predictionHistory.length > 50) predictionHistory.pop();

                // Thống kê tỉ lệ thắng
                const thongKe = apiResponseData.Thong_ke;
                if (apiResponseData.Du_doan && apiResponseData.Du_doan !== "Đang chờ dữ liệu...") {
                    if (apiResponseData.Du_doan === result) {
                        thongKe.dung++;
                        consecutive_losses = 0;
                    } else {
                        thongKe.sai++;
                        consecutive_losses++;
                    }
                    thongKe.tong_du_doan++;
                    thongKe.ti_le_dung = Math.round((thongKe.dung / thongKe.tong_du_doan) * 100) + "%";
                }

                // Tính toán dự đoán cho phiên sau
                const prediction = getAdvancedPrediction();
                const nextSession = currentSessionId ? (parseInt(currentSessionId) + 1).toString() : "N/A";

                apiResponseData = {
                    Phien: currentSessionId,
                    Xuc_xac: [d1, d2, d3],
                    Tong: total,
                    Ket_qua: result,
                    Du_doan: prediction.du_doan,
                    Do_tin_cay: prediction.do_tin_cay + "%",
                    Phien_du_doan: nextSession,
                    Xac_suat: { Tai: prediction.xac_suat_tai + "%", Xiu: prediction.xac_suat_xiu + "%" },
                    Phuong_phap: prediction.phuong_phap,
                    Lich_su: prediction.lich_su_gan_nhat,
                    Thong_ke: thongKe,
                    timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
                    author: "@AnhTuấnMMO"
                };

                console.log(`[🎲] Phiên ${currentSessionId}: ${total} (${result}) -> Dự đoán: ${prediction.du_doan}`);
            }
        } catch (err) {
            // Bỏ qua lỗi định dạng không phải JSON
        }
    });

    ws.on('close', () => {
        console.log('[⚠️] Mất kết nối. Thử lại sau 5 giây...');
        setTimeout(connectWebSocket, 5000);
    });

    ws.on('error', (e) => console.error('[❌] Lỗi WS:', e.message));
}

// ========== ROUTES ==========
app.get('/', (req, res) => res.json(apiResponseData));
app.get('/api/data', (req, res) => res.json(apiResponseData));

app.listen(PORT, () => {
    console.log(`[🚀] Server: http://localhost:${PORT}`);
    connectWebSocket();
});
