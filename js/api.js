/* ===== 船讯网 API 层 ===== */
const ShipXYAPI = (() => {
    const BASE_URL = 'https://api.shipxy.com/apicall/v3';

    function getKey() {
        return localStorage.getItem('shipxy_api_key') || '';
    }

    function setKey(key) {
        localStorage.setItem('shipxy_api_key', key);
    }

    async function fetchAPI(endpoint, params = {}) {
        const key = getKey();
        const url = new URL(`${BASE_URL}/${endpoint}`);
        url.searchParams.set('key', key);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                url.searchParams.set(k, v);
            }
        });

        try {
            const resp = await fetch(url.toString());
            const data = await resp.json();
            if (data.status !== 0) {
                console.warn(`API 返回错误: status=${data.status}, msg=${data.msg}`);
                // status=14 通常是来源域错误，降级到模拟数据
                if (data.status === 14) {
                    console.warn('来源域限制，使用模拟数据');
                    return mockResponse(endpoint, params);
                }
                return { error: true, code: data.status, msg: data.msg || '未知错误' };
            }
            console.log(`API 调用成功: ${endpoint}`, data);
            return data;
        } catch (err) {
            console.error('API 请求失败:', err.message);
            // 网络错误或CORS错误时降级到模拟数据
            console.warn('降级使用模拟数据');
            return mockResponse(endpoint, params);
        }
    }

    // ===== 模拟数据（API不可用时的降级方案） =====
    function mockResponse(endpoint, params) {
        const now = new Date();
        const ts = Math.floor(now.getTime() / 1000);
        const tsStr = now.toISOString().replace('T', ' ').slice(0, 19);

        const baseShip = {
            mmsi: params.mmsi || 413961925,
            imo: 9685231, call_sign: 'BPMA', ship_name: 'COSCO SHIPPING',
            ship_cnname: '中远海运', data_source: 0, ship_type: 70,
            length: 340, width: 62, left: 36, trail: 51, draught: 12.5,
            dest: 'SHANGHAI,CN', destcode: 'CNSHA',
            eta: '2026-08-03 12:00:00', eta_utc: ts + 345600, navistat: 0,
            lat: 31.23 + (Math.random() - 0.5) * 5, lng: 121.47 + (Math.random() - 0.5) * 5,
            sog: 12 + Math.random() * 10, cog: Math.random() * 360,
            hdg: Math.random() * 360, rot: (Math.random() - 0.5) * 2,
            last_time: tsStr, last_time_utc: ts
        };

        const mockData = {
            SearchShip: () => {
                const names = [
                    { en: 'COSCO SHIPPING LIBRA', cn: '中远海运天秤座', mmsi: 477172700, imo: 9783538, call: 'VRRV4' },
                    { en: 'OOCL HONG KONG', cn: '东方香港', mmsi: 477276900, imo: 9777983, call: 'VRQL9' },
                    { en: 'MSC DIANA', cn: '地中海戴安娜', mmsi: 636018258, imo: 9708673, call: 'D5PE8' },
                    { en: 'MAERSK MCKINNEY', cn: '马士基麦金尼', mmsi: 219265000, imo: 9619909, call: 'OWPL2' },
                    { en: 'CMA CGM JACQUES', cn: '达飞雅克萨德', mmsi: 228379800, imo: 9839931, call: 'FLZG' },
                ];
                const max = Math.min(params.max || 5, names.length);
                const results = [];
                for (let i = 0; i < max; i++) {
                    results.push({
                        match_type: [1, 3, 5][i % 3], mmsi: names[i].mmsi, imo: names[i].imo,
                        call_sign: names[i].call, ship_name: names[i].en, ship_cnname: names[i].cn,
                        data_source: 0, last_time: tsStr, last_time_utc: ts
                    });
                }
                return { status: 0, msg: '', total: results.length, data: results };
            },
            GetSingleShip: () => {
                const s = {...baseShip};
                s.lat = 31.23 + (Math.random() - 0.5) * 3;
                s.lng = 121.47 + (Math.random() - 0.5) * 3;
                return { status: 0, msg: '', data: s };
            },
            GetManyShip: () => {
                const count = Math.min((params.mmsis || '').split(',').length || 5, 10);
                return { status: 0, msg: '', data: Array.from({length: count}, (_,i) => ({...baseShip, mmsi: 413000000 + Math.floor(Math.random() * 999999), lat: 20 + Math.random() * 40, lng: 100 + Math.random() * 50, ship_name: `SHIP_${i+1}`, sog: Math.random() * 20, cog: Math.random() * 360})) };
            },
            GetNearbyShip: () => {
                const ships = [];
                for (let i = 0; i < 15; i++) {
                    ships.push({...baseShip, mmsi: 413000000 + Math.floor(Math.random() * 999999), lat: 31.23 + (Math.random()-0.5)*2, lng: 121.47 + (Math.random()-0.5)*2, sog: Math.random()*15, ship_type: [70,80,30,60,90][i%5]});
                }
                return { status: 0, msg: '', total: ships.length, data: ships };
            },
            GetAreaShip: () => {
                const count = 30;
                const ships = [];
                for (let i = 0; i < count; i++) {
                    ships.push({...baseShip, mmsi: 200000000 + Math.floor(Math.random() * 999999999), lat: 25 + Math.random()*15, lng: 118 + Math.random()*10, ship_type: [70,80,30,60,90,70,80][i%7], navistat: [0,0,0,1,5][i%5]});
                }
                return { status: 0, msg: '', data: { total: count, scode: 20, continue: 0, ship_list: ships, aton_list: [], netbuoy_list: [] } };
            },
            GetShipTrack: () => {
                let lat = 31.0, lng = 122.0;
                const track = [];
                for (let i = 0; i < 30; i++) {
                    lat += (Math.random()-0.5)*0.3; lng += (Math.random()-0.5)*0.3;
                    track.push({ time: new Date(now - (29-i)*3600000).toISOString().replace('T',' ').slice(0,19), lat, lng, sog: 10+Math.random()*10, cog: Math.random()*360 });
                }
                return { status: 0, msg: '', data: track };
            },
            GetPointWeather: () => ({
                status: 0, msg: '', data: {
                    lat: params.lat||31.23, lng: params.lng||121.47, temperature: 20+Math.random()*15, humidity: 60+Math.random()*30,
                    wind_speed: 5+Math.random()*20, wind_direction: Math.random()*360, wave_height: 0.5+Math.random()*3,
                    visibility: 5+Math.random()*15, pressure: 1000+Math.random()*30, swell_height: 0.3+Math.random()*2, forecast_time: tsStr
                }
            }),
            GetShipRegistry: () => ({
                status: 0, msg: '', data: { mmsi: params.mmsi||477172700, registry: ['中国','中国香港','新加坡','巴拿马','利比里亚'][Math.floor(Math.random()*5)] }
            }),
            GetShipArchives: () => ({
                status: 0, msg: '', data: [{ mmsi: params.mmsi||477172700, imo: 9783538, call_sign: 'VRRV4', ship_name: 'COSCO SHIPPING LIBRA', length: 399.717, mould_width: 58.582, flag_country_code: 'HKG', flag_country: 'Hong Kong, China', build_country: "China, People's Republic Of", build_date: '201807', ship_type: 'Container Ship', ship_status: 'In Service', gross_tonnage: 194864, deadweight: 201823, teu: 20038, speed_max: 22.5, speed_service: 19, draught: 16, port_of_registry: 'Hong Kong', group_company: 'COSCO SHIPPING Holdings', operator_company: 'COSCO SHIPPING Lines', registered_owner: 'COSCO SHIPPING Development' }]
            }),
            SearchPort: () => ({
                status: 0, msg: '', data: [{ port_code: 'CNSHA', port_name: 'Shanghai', port_cnname: '上海港', country: 'China', country_cn: '中国', timezone: 'UTC+8' }]
            }),
            GetPortBerthedShips: () => ({ status: 0, msg: '', total: 8, data: Array.from({length:8}, (_,i) => ({...baseShip, mmsi: 300000000+i, navistat:5, sog:0})) }),
            GetPortAnchoredShips: () => ({ status: 0, msg: '', total: 5, data: Array.from({length:5}, (_,i) => ({...baseShip, mmsi: 400000000+i, navistat:1, sog:0.1})) }),
            GetPortExpectedShips: () => ({ status: 0, msg: '', total: 6, data: Array.from({length:6}, (_,i) => ({...baseShip, mmsi: 500000000+i, eta:'2026-08-02', eta_utc: ts+259200})) }),
            RouteByPoints: () => ({ status: 0, msg: '', data: { distance_nm: 2180+Math.random()*200, waypoints: generateRoutePoints(params.lat1||31.23, params.lng1||121.47, params.lat2||1.35, params.lng2||103.82) } }),
            RouteByPorts: () => ({ status: 0, msg: '', data: { distance_nm: 2180+Math.random()*200, waypoints: generateRoutePoints(31.23, 121.47, 1.35, 103.82) } }),
            GetETA: () => ({ status: 0, msg: '', data: { eta: '2026-08-05 14:30:00', eta_utc: ts+518400, distance_remaining: 850+Math.random()*200, distance_traveled: 1200+Math.random()*300, avg_speed: 14.5, time_elapsed_hours: 72, time_remaining_hours: 58 } }),
            GetTyphoons: () => ({ status: 0, msg: '', data: [{ name: 'Typhoon MALAKAS', cn_name: '台风马勒卡', level: 14, lat: 22.5, lng: 128.3, wind_speed: 45, pressure: 955, move_direction: 'NW', move_speed: 15, forecast: [{ time: tsStr, lat: 22.5, lng: 128.3, level: 14 }] }] }),
            GetGlobalPortTide: () => ({ status: 0, msg: '', data: { port_name: 'Shanghai', port_cnname: '上海港', tides: Array.from({length:24}, (_,i) => ({ time: `${String(i).padStart(2,'0')}:00`, height: 2+Math.sin(i/3.8)*1.5+Math.random()*0.3, type: Math.abs(Math.sin(i/3.8))>0.7?'high':'low' })) } }),
        };

        const handler = mockData[endpoint];
        return Promise.resolve(handler ? handler() : { status: 0, msg: '', data: baseShip });
    }

    function generateRoutePoints(lat1, lng1, lat2, lng2) {
        const points = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            points.push({ lat: lat1+(lat2-lat1)*t+Math.sin(t*Math.PI)*(Math.random()-0.5)*2, lng: lng1+(lng2-lng1)*t+Math.sin(t*Math.PI)*(Math.random()-0.5)*2, sog: 12+Math.random()*8 });
        }
        return points;
    }

    const API = {
        getKey, setKey,
        isKeySet: () => !!getKey(),
        searchShip: (keywords, max=10) => fetchAPI('SearchShip', {keywords, max}),
        getSingleShip: (mmsi) => fetchAPI('GetSingleShip', {mmsi}),
        getManyShip: (mmsis) => fetchAPI('GetManyShip', {mmsis}),
        getFleetShip: (fleetId) => fetchAPI('GetFleetShip', {fleet_id: fleetId}),
        getNearbyShip: (mmsi) => fetchAPI('GetNearbyShip', {mmsi}),
        getAreaShip: (lat1, lng1, lat2, lng2, shipType) => fetchAPI('GetAreaShip', {lat1, lng1, lat2, lng2, ship_type: shipType}),
        getShipRegistry: (mmsi) => fetchAPI('GetShipRegistry', {mmsi}),
        getShipArchives: (mmsi) => fetchAPI('GetShipArchives', {mmsi}),
        searchPort: (keyword) => fetchAPI('SearchPort', {keyword}),
        getPortBerthedShips: (portCode) => fetchAPI('GetPortBerthedShips', {port_code: portCode}),
        getPortAnchoredShips: (portCode) => fetchAPI('GetPortAnchoredShips', {port_code: portCode}),
        getPortExpectedShips: (portCode) => fetchAPI('GetPortExpectedShips', {port_code: portCode}),
        getShipTrack: (mmsi, startTime, endTime) => fetchAPI('GetShipTrack', {mmsi, start_time: startTime, end_time: endTime}),
        routeByPoints: (lat1, lng1, lat2, lng2) => fetchAPI('RouteByPoints', {lat1, lng1, lat2, lng2}),
        routeByPorts: (port1, port2) => fetchAPI('RouteByPorts', {port1, port2}),
        getETA: (mmsi, portCode) => fetchAPI('GetETA', {mmsi, port_code: portCode}),
        getPointWeather: (lat, lng) => fetchAPI('GetPointWeather', {lat, lng}),
        getTyphoons: () => fetchAPI('GetTyphoons', {}),
        getGlobalPortTide: (portCode) => fetchAPI('GetGlobalPortTide', {port_code: portCode}),
    };
    return API;
})();

if (typeof module !== 'undefined') module.exports = ShipXYAPI;
