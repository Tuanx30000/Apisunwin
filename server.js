const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ========== THUẬT TOÁN DỰ ĐOÁN ĐƠN GIẢN ==========
let predictionHistory = [];
let consecutive_losses = 0;

function getSimplePrediction() {
    // Mặc định nếu chưa có lịch sử
    if (predictionHistory.length < 3) {
        return {
            du_doan: "Xỉu",
            do_tin_cay: 65,
            xac_suat_tai: 50,
            xac_suat_xiu: 50,
            phuong_phap: "Mặc định"
        };
    }

    // Lấy 5 kết quả gần nhất
    const recentResults = predictionHistory.slice(0, 5);
    let taiCount = 0, xiuCount = 0;
    
    recentResults.forEach(r => {
        if (r.Ket_qua === "Tài") taiCount++;
        else xiuCount++;
    });

    const lastResult = predictionHistory[0]?.Ket_qua || "Xỉu";
    let du_doan, do_tin_cay, phuong_phap;

    // Nếu thua 2 tay liên tiếp -> đánh ngược lại
    if (consecutive_losses >= 2) {
        du_doan = lastResult === "Tài" ? "Xỉu" : "Tài";
        do_tin_cay = 85;
        phuong_phap = "Phá cầu (thua 2 tay)";
    }
    // Nếu Tài nhiều hơn -> đoán Xỉu (bẻ cầu)
    else if (taiCount > xiuCount) {
        du_doan = "Xỉu";
        do_tin_cay = 60 + (taiCount - xiuCount) * 8;
        phuong_phap = "Bẻ cầu Tài";
    }
    // Nếu Xỉu nhiều hơn -> đoán Tài (bẻ cầu)
    else if (xiuCount > taiCount) {
        du_doan = "Tài";
        do_tin_cay = 60 + (xiuCount - taiCount) * 8;
        phuong_phap = "Bẻ cầu Xỉu";
    }
    // Nếu cân bằng -> đánh theo cầu
    else {
        du_doan = lastResult === "Tài" ? "Tài" : "Xỉu";
        do_tin_cay = 70;
        phuong_phap = "Theo cầu (cân bằng)";
    }

    // Giới hạn độ tin cậy
    do_tin_cay = Math.min(95, Math.max(55, Math.round(do_tin_cay)));

    return {
        du_doan: du_doan,
        do_tin_cay: do_tin_cay,
        xac_suat_tai: du_doan === "Tài" ? do_tin_cay : 100 - do_tin_cay,
        xac_suat_xiu: du_doan === "Xỉu" ? do_tin_cay : 100 - do_tin_cay,
        phuong_phap: phuong_phap,
        lich_su_gan_nhat: recentResults.map(r => r.Ket_qua),
        ti_le_tai: ((taiCount / recentResults.length) * 100).toFixed(0) + "%",
        ti_le_xiu: ((xiuCount / recentResults.length) * 100).toFixed(0) + "%"
    };
}

// ========== DATA JSON ==========
let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "Du_doan": "",
    "Do_tin_cay": "",
    "Phien_du_doan": null, // Thêm trường cho phiên dự đoán
    "Xac_suat": {
        "Tai": "",
        "Xiu": ""
    },
    "Phuong_phap": "",
    "Lich_su": [],
    "Thong_ke": {
        "tong_du_doan": 0,
        "dung": 0,
        "sai": 0,
        "ti_le_dung": "0%"
    },
    "id": "@hirosima0123"
};

let currentSessionId = null;
let lastSessionId = null;
let nextPredictionSession = null; // Lưu phiên dự đoán tiếp theo
const patternHistory = [];

const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_apivopnha",
        "WangLin",
        {
            "info": "{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}",
            "signature": "45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected.');
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 600);
        });

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, PING_INTERVAL);
    });

    ws.on('pong', () => {
        console.log('[📶] Ping OK.');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (!Array.isArray(data) || typeof data[1] !== 'object') {
                return;
            }

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
                // Lưu phiên hiện tại để tính phiên tiếp theo
                lastSessionId = sid;
            }

            if (cmd === 1003 && gBB) {
                if (!d1 || !d2 || !d3) return;

                const total = d1 + d2 + d3;
                const result = (total > 10) ? "Tài" : "Xỉu";

                // Lưu kết quả vào lịch sử
                const newResult = {
                    Phien: currentSessionId,
                    Xuc_xac_1: d1,
                    Xuc_xac_2: d2,
                    Xuc_xac_3: d3,
                    Tong: total,
                    Ket_qua: result
                };
                
                predictionHistory.unshift(newResult);
                
                // Chỉ giữ 50 kết quả gần nhất
                if (predictionHistory.length > 50) {
                    predictionHistory.pop();
                }

                // Cập nhật thống kê
                let thongKe = apiResponseData.Thong_ke;
                if (apiResponseData.Du_doan) {
                    if (apiResponseData.Du_doan === result) {
                        thongKe.dung++;
                        consecutive_losses = 0;
                    } else {
                        thongKe.sai++;
                        consecutive_losses++;
                    }
                    thongKe.tong_du_doan++;
                    thongKe.ti_le_dung = ((thongKe.dung / thongKe.tong_du_doan) * 100).toFixed(0) + "%";
                }

                // Tạo dự đoán cho phiên tiếp theo
                const prediction = getSimplePrediction();
                
                // Tính phiên dự đoán tiếp theo (phiên hiện tại + 1)
                if (lastSessionId) {
                    // Giả sử sessionId là số, nếu không phải số thì giữ nguyên
                    const sessionNum = parseInt(lastSessionId);
                    if (!isNaN(sessionNum)) {
                        nextPredictionSession = (sessionNum + 1).toString();
                    } else {
                        nextPredictionSession = lastSessionId + "_next";
                    }
                }

                // Cập nhật API response
                apiResponseData = {
                    "Phien": currentSessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result,
                    "Du_doan": prediction.du_doan,
                    "Do_tin_cay": prediction.do_tin_cay + "%",
                    "Phien_du_doan": nextPredictionSession, // Thêm phiên dự đoán tiếp theo
                    "Xac_suat": {
                        "Tai": prediction.xac_suat_tai + "%",
                        "Xiu": prediction.xac_suat_xiu + "%"
                    },
                    "Phuong_phap": prediction.phuong_phap,
                    "Lich_su": predictionHistory.slice(0, 10).map(r => r.Ket_qua),
                    "Thong_ke": thongKe,
                    "id": "@hirosima0123"
                };
                
                console.log(`✅ Phiên ${apiResponseData.Phien}: ${apiResponseData.Tong} (${apiResponseData.Ket_qua})`);
                console.log(`🔮 Dự đoán phiên ${apiResponseData.Phien_du_doan}: ${apiResponseData.Du_doan} (${apiResponseData.Do_tin_cay}) - ${apiResponseData.Phuong_phap}`);
                console.log(`📊 Thống kê: ${thongKe.dung}/${thongKe.tong_du_doan} (${thongKe.ti_le_dung})`);
                
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close();
    });
}

app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

app.get('/', (req, res) => {
    res.json(apiResponseData);
});

app.listen(PORT, () => {
    console.log(`[🌐] Server is running at http://localhost:${PORT}`);
    connectWebSocket();
});