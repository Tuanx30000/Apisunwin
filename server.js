/**
 * PROJECT: Tuanx3000 - Professional Prediction Engine
 * Version: 3.0.0 (Ultra Stable)
 */

const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ========== TRẠNG THÁI HỆ THỐNG Tuanx3000 ==========
let state = {
    predictionHistory: [],
    consecutiveLosses: 0,
    lastSessionId: null,
    nextSessionId: null,
    isWaiting: true,
    apiData: {
        Phien: null,
        Xuc_xac: [0, 0, 0],
        Tong: 0,
        Ket_qua: "Đang chờ...",
        Du_doan: "Đang phân tích...",
        Do_tin_cay: "0%",
        Phien_du_doan: null,
        Xac_suat: { Tai: "50%", Xiu: "50%" },
        Phuong_phap: "Khởi tạo hệ thống",
        Lich_su: [],
        Thong_ke: {
            tong_du_doan: 0,
            dung: 0,
            sai: 0,
            ti_le_dung: "0%"
        },
        id: "Tuanx3000_Gold_v3"
    }
};

// ========== LOGIC PHÂN TÍCH CAO CẤP ==========
function calculateAdvancedPrediction() {
    const history = state.predictionHistory;
    if (history.length < 5) {
        return { suggestion: "Tài", confidence: 55, method: "Dò cầu ban đầu" };
    }

    const lastResult = history[0].result;
    const recent6 = history.slice(0, 6).map(h => h.result);
    const taiCount = recent6.filter(r => r === "Tài").length;
    const xiuCount = recent6.length - taiCount;

    let suggestion = "";
    let confidence = 60;
    let method = "";

    // 1. Xử lý chuỗi thua (Chiến thuật phục hồi)
    if (state.consecutiveLosses >= 2) {
        suggestion = lastResult === "Tài" ? "Xỉu" : "Tài";
        confidence = 88;
        method = "Bẻ cầu (Sau " + state.consecutiveLosses + " tay thua)";
    } 
    // 2. Nhận diện cầu 1-1 (Tài-Xỉu-Tài-Xỉu)
    else if (recent6[0] !== recent6[1] && recent6[1] !== recent6[2]) {
        suggestion = recent6[0] === "Tài" ? "Xỉu" : "Tài";
        confidence = 75;
        method = "Cầu nhịp 1-1";
    }
    // 3. Nhận diện cầu bệt (Dây liên tiếp)
    else if (recent6[0] === recent6[1] && recent6[1] === recent6[2]) {
        suggestion = recent6[0];
        confidence = 82;
        method = "Bám cầu bệt";
    }
    // 4. Phân tích xác suất lệch
    else {
        suggestion = taiCount > xiuCount ? "Xỉu" : "Tài";
        confidence = 65 + (Math.abs(taiCount - xiuCount) * 5);
        method = "Đánh nghịch (Cân bằng xác suất)";
    }

    return {
        suggestion,
        confidence: Math.min(96, confidence),
        method
    };
}

// ========== QUẢN LÝ WEBSOCKET (Core) ==========
const WS_CONFIG = {
    url: "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0",
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
        "Origin": "https://play.sun.win"
    }
};

function startTuanx3000() {
    let ws = new WebSocket(WS_CONFIG.url, { headers: WS_CONFIG.headers });
    let heartbeat;

    ws.on('open', () => {
        console.log('--- [Tuanx3000] CONNECTED SUCCESS ---');
        // Auth payload (giữ nguyên logic gốc của bạn)
        const authPayloads = [
            [1, "MiniGame", "GM_apivopnha", "WangLin", { "info": "...", "signature": "..." }],
            [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
            [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
        ];
        authPayloads.forEach((p, i) => setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify(p)), i * 500));

        heartbeat = setInterval(() => ws.readyState === 1 && ws.ping(), 20000);
    });

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const msg = data[1];
            if (!msg) return;

            // Cập nhật ID phiên hiện tại
            if (msg.sid) state.lastSessionId = msg.sid;

            // Xử lý khi có kết quả chính thức (cmd 1003)
            if (msg.cmd === 1003 && msg.gBB) {
                const { d1, d2, d3 } = msg;
                if (d1 === undefined) return;

                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";
                const phienHienTai = state.lastSessionId;

                // Thống kê kết quả dựa trên dự đoán cũ
                if (state.apiData.Du_doan !== "Đang phân tích...") {
                    const win = state.apiData.Du_doan === result;
                    state.apiData.Thong_ke.tong_du_doan++;
                    if (win) {
                        state.apiData.Thong_ke.dung++;
                        state.consecutiveLosses = 0;
                    } else {
                        state.apiData.Thong_ke.sai++;
                        state.consecutiveLosses++;
                    }
                    const tiLe = (state.apiData.Thong_ke.dung / state.apiData.Thong_ke.tong_du_doan * 100).toFixed(1);
                    state.apiData.Thong_ke.ti_le_dung = tiLe + "%";
                }

                // Lưu lịch sử
                state.predictionHistory.unshift({ phien: phienHienTai, result: result });
                if (state.predictionHistory.length > 30) state.predictionHistory.pop();

                // Tính toán dự đoán cho phiên sau
                const analysis = calculateAdvancedPrediction();
                state.nextSessionId = (parseInt(phienHienTai) + 1).toString();

                // Cập nhật API trả về
                state.apiData = {
                    ...state.apiData,
                    Phien: phienHienTai,
                    Xuc_xac: [d1, d2, d3],
                    Tong: total,
                    Ket_qua: result,
                    Du_doan: analysis.suggestion,
                    Do_tin_cay: analysis.confidence + "%",
                    Phien_du_doan: state.nextSessionId,
                    Xac_suat: {
                        Tai: analysis.suggestion === "Tài" ? analysis.confidence + "%" : (100 - analysis.confidence) + "%",
                        Xiu: analysis.suggestion === "Xỉu" ? analysis.confidence + "%" : (100 - analysis.confidence) + "%"
                    },
                    Phuong_phap: analysis.method,
                    Lich_su: state.predictionHistory.slice(0, 12).map(h => h.result)
                };

                console.log(`[Tuanx3000] Phiên ${phienHienTai}: ${result} -> Dự đoán ${state.nextSessionId}: ${analysis.suggestion} (${analysis.confidence}%)`);
            }
        } catch (err) {
            console.error('[Tuanx3000] Lỗi xử lý luồng dữ liệu.');
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeat);
        console.log('[Tuanx3000] Kết nối bị ngắt. Đang tái khởi động...');
        setTimeout(startTuanx3000, 3000);
    });

    ws.on('error', () => ws.close());
}

// ========== SERVER ENDPOINTS ==========
app.get('/', (req, res) => res.json(state.apiData));
app.get('/status', (req, res) => res.json({ status: "Online", engine: "Tuanx3000-v3", uptime: process.uptime() }));

app.listen(PORT, () => {
    console.log(`--- SYSTEM READY ON PORT ${PORT} ---`);
    startTuanx3000();
});
