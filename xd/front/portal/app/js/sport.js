/* eslint-disable no-prototype-builtins */
"use strict";
(function(g) {
    const wsUrls = {
        bm: ["wss://ws1.platformtest.net/", "wss://ws2.platformtest.net/"],
        bb: ["wss://ws1.korabi2.com/", "wss://ws2.korabi2.com/"],
    };

    let sportSelectedId;
    // let sportModel = 1;
    let sportModel = {};
    let rawSportConfigStore = {
        l: {
            cs: {},
            cc: {},
            cg: {},
            ct: {},
            cp: {},
            cl: {},
            sts: {},
            clr: {},
        },
        m: {
            cs: {},
            cc: {},
            cg: {},
            ct: {},
            cp: {},
            cl: {},
            sts: {},
            clr: {},
        },
        h: {
            cs: {},
            cc: {},
            cg: {},
            ct: {},
            cp: {},
            cl: {},
            sts: {},
            clr: {},
        },
        s: {
            cs: {},
            cc: {},
            cg: {},
            ct: {},
            cp: {},
            cl: {},
            sts: {},
            clr: {},
        },
    };
    let sportConfigStore = {
        cs: {},
        cc: {},
        cg: {},
        ct: {},
        cp: {},
        cl: {},
    };

    let rawStore = {};
    let tempStore = {};
    let tempStoreLive = {};
    let matchStore = {};
    let marketFilterStore = {};
    let sourcesStore = {
        0: {},
        1: {},
    };
    let clonesStore = {};
    let marketStore = {};
    let storeInView = {};

    let oddsFeed = {};
    let oddsStore = {};
    let extraOddsFeed = {};
    let extraOddsStore = {};
    let extraMatchOpened;

    let oddsChangeStore = {};

    let betslipOddsFeed = {};
    let betslipOddsStore = {};
    let betslipStore = {
        matchAllIds: [],
        matchById: {},
        totalBets: 0,
        totalOdds: 1,
    };
    let ticketStore = {
        allIds: [],
        byId: {},
    };

    let localMarketGroups = {};
    let localMarketGroupsLoaded = false;

    let subscriptions = [];
    let spSocket;

    let outcomeAlias = {};
    let outcomeToAlias = {};

    let marketTemplates = {};

    let marketsList = {};

    let pendingTicketId;
    let ticketResubmitTimeout;
    let ticketHoldTimeout;
    let ticketProcessing = false;

    async function initApp() {
        let saveSportModel = false;
        if (g.domainConfigs["nologin_sportmodel"]) {
            sportModel.m = +g.domainConfigs["nologin_sportmodel"];
        }
        if (g.domainConfigs["nologin_sportmodel_hi"]) {
            sportModel.h = +g.domainConfigs["nologin_sportmodel_hi"];
        }
        if (g.domainConfigs["nologin_sportmodel_lo"]) {
            sportModel.l = +g.domainConfigs["nologin_sportmodel_lo"];
        }
        if (localStorage["lastSportModel"] && typeof JSON.parse(localStorage["lastSportModel"]) === "object") {
            try {
                const {
                    m,
                    h,
                    l
                } = JSON.parse(localStorage["lastSportModel"]);
                sportModel = {
                    m,
                    h,
                    l
                };
            } catch (e) {
                console.log(e);
            }
        }
        if (g.userStore.parameters && g.userStore.parameters.sport_model) {
            saveSportModel = true;
            sportModel.m = +g.userStore.parameters.sport_model;
        }
        if (g.userStore.parameters && g.userStore.parameters.sport_model_hi) {
            saveSportModel = true;
            sportModel.h = +g.userStore.parameters.sport_model_hi;
        }
        if (g.userStore.parameters && g.userStore.parameters.sport_model_lo) {
            saveSportModel = true;
            sportModel.l = +g.userStore.parameters.sport_model_lo;
        }
        if (saveSportModel) {
            localStorage.setItem("lastSportModel", JSON.stringify(sportModel));
        }

        sportModel.s = 0;

        spSocket = await createSocket();
        g.spSocket = spSocket;
        for (let level in sportModel) {
            if (+sportModel[level] !== -1) {
                spSocket.subscribe("conf" + sportModel[level]);
            }
        }
        const {
            shard,
            elId_live,
            elId_prematch
        } = g.domainConfigs;
        let shard_p = elId_prematch ? `${shard}${elId_prematch}` : `${shard}`;
        let shard_l = elId_live ? `${shard}${elId_live}` : `${shard}`;
        spSocket.subscribe(`${shard_p}_sp`);
        spSocket.subscribe(`${shard_l}_sl`);

        if (g.userStore.username && g.userStore.username !== "nologin") {
            g.platformApiCall(".in?action=get&subaction=tickets_hold", "json", {}, "api", "json", 1, (data) => {
                if (data.Message !== "no_record") {
                    for (const ticketId in data.data) {
                        if (data.data.hasOwnProperty(ticketId)) {
                            let ticketHeader = {};
                            if (data.data[ticketId].ticket_data) {
                                let ticketData = data.data[ticketId].ticket_data;
                                for (let prop in data.schema.ticket_header) {
                                    if (data.schema.ticket_header.hasOwnProperty(prop)) {
                                        if (prop === "ops") {
                                            ticketHeader[prop] = ticketData[data.schema.ticket_header[prop]].split("#")[1];
                                        } else if (prop === "round") {
                                            ticketHeader[prop] = (ticketData[data.schema.ticket_header[prop]] + "").slice(-3);
                                        } else if (prop === "time") {
                                            ticketHeader[prop] = g.moment(ticketData[data.schema.ticket_header[prop]]).format("L, HH:mm");
                                        } else {
                                            ticketHeader[prop] = ticketData[data.schema.ticket_header[prop]];
                                        }
                                    }
                                }
                                if (+ticketHeader.state === -2) {
                                    let lines = [];
                                    let ticketLines = data.data[ticketId].ticket_lines;
                                    for (let matchId in ticketLines) {
                                        if (ticketLines.hasOwnProperty(matchId)) {
                                            let lineObj = {};
                                            for (let prop in data.schema.lines_header) {
                                                if (data.schema.lines_header.hasOwnProperty(prop)) {
                                                    lineObj[prop] = ticketLines[matchId][data.schema.lines_header[prop]];
                                                }
                                            }
                                            lines.push(lineObj);
                                        }
                                    }
                                    ticketHeader.lines = lines;
                                }
                                ticketStore.byId[ticketId] = ticketHeader;
                                ticketStore.allIds.unshift(ticketId);
                                let out = {
                                    action: "betslip-store",
                                    payload: {
                                        betslipStore,
                                        ticketStore
                                    },
                                };
                                for (let i = 0; i < g.frames.length; i++) {
                                    g.frames[i].postMessage(out, "*");
                                }
                                if (ticketHeader.state < 0) {
                                    spSocket.subscribe(`ts${ticketHeader.ticket_id}`);
                                }
                            }
                        }
                    }
                }
            });
        }

        // if (sessionStorage.betslipStore) {
        //   betslipStore = JSON.parse(sessionStorage.betslipStore);
        //   updateBetslipStore(1);
        // }
        let selectedApp = "sport";
        let iframe = document.getElementById("center-widget");
        if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.id = "center-widget";
            iframe.allow = "fullscreen";
            iframe.allowFullscreen = true;
            iframe.name = "app";
        }
        if (g.params) {
            if (g.params.includes("screen")) {
                selectedApp = "screen";
            } else if (g.params.includes("shop")) {
                selectedApp = "shop";
            } else if (g.params.includes("sbooking")) {
                selectedApp = "sbooking";
            }
        } else {
            if (g.userStore && g.userStore.parameters && g.userStore.parameters.shop_mode * 1 === 2) {
                selectedApp = "terminal";
            }
        }
        if (g.urlView) {
            selectedApp = g.urlView;
        }
        if (Number(g.domainConfigs[`${selectedApp}_v`])) {
            selectedApp += `_v${Number(g.domainConfigs[`${selectedApp}_v`])}`;
        }
        iframe.src = `../sp/${selectedApp}/current/`;
        document.body.appendChild(iframe);
    }

    function delta_update(source, update) {
        for (const prop in update) {
            if (Object.keys(source).length == 0 || !Object.hasOwnProperty.call(source, prop)) source[prop] = update[prop];
            else if (typeof update[prop] === "object" && update[prop] !== null && !Array.isArray(update[prop])) delta_update(source[prop], update[prop]);
            else source[prop] = update[prop];
        }
    }

    async function createSocket() {
        let selectedSocket;
        let socketReady = false;
        let socket = {
            connected: false
        };
        let eventMaps = {};

        async function getSocketAuth() {
            if (g.userStore.username === "nologin") {
                return {
                    msg: "ok",
                    token: "c38eab71691b4306faefaf336a3cec7833c605bd5c27d78761b9421431a44fce",
                    time: "7258114801",
                };
            }
            const _data = await g.platformApiCall(".in?action=auth_socket&username=" + g.userStore.username, "text", {}, "api", "text", 1);
            const [msg, token, time] = _data.split("~");
            return {
                msg,
                token,
                time
            };
        }

        const getUrl = () => {
            const {
                shard
            } = g.domainConfigs;
            const options = wsUrls[shard];
            return options[Math.floor(Math.random() * options.length)];
        };

        async function socketConnect() {
            try {
                const {
                    msg,
                    token,
                    time
                } = await getSocketAuth();
                if (msg !== "ok") return;

                let url = getUrl();
                // if (g.haUrl) url = g.haUrl.replace("https", "wss");

                let user = g.userStore.username === "nologin" ? "nologin_user" : g.userStore.username;

                const webSocket = new WebSocket(`${url}rtdt\u001F${user}\u001F${token}\u001F${time}`);
                const {
                    shard,
                    elId_live,
                    elId_prematch
                } = g.domainConfigs;

                webSocket.onmessage = function(e) {
                    setTimeout(async () => {
                        let data = e.data.split("\u001F");
                        let shard_p = elId_prematch ? `${shard}${elId_prematch}` : `${shard}`;
                        let shard_l = elId_live ? `${shard}${elId_live}` : `${shard}`;
                        const {
                            pattern,
                            isDelta
                        } = channelPattern(data[0], data[1], shard_p, shard_l);
                        if (!pattern) return;
                        switch (pattern) {
                            case "info_pub":
                                {
                                    socketReady = true;
                                    if (subscriptions.length > 0) {
                                        subscriptions.forEach((sub) => {
                                            socket.subscribe(sub[0], sub[1]);
                                        });
                                        subscriptions = [];
                                    }

                                    const out = {
                                        action: "socket_connected",
                                    };
                                    for (let i = 0; i < window.frames.length; i++) {
                                        window.frames[i].postMessage(out, "*");
                                    }
                                    break;
                                }
                            case "sp":
                                {
                                    break;
                                }
                            case "sl":
                                {
                                    break;
                                }
                            case "ep":
                                {
                                    const sportId = +data[1].split(`${shard_p}_ep`)[1];
                                    const delta = JSON.parse(data[2]);
                                    const patch = patchEventsList(0, sportId, delta);
                                    let out = {
                                        action: "sport-selected-update",
                                        payload: {
                                            store: patch,
                                        },
                                    };
                                    for (let i = 0; i < window.frames.length; i++) {
                                        window.frames[i].postMessage(out, "*");
                                    }
                                    break;
                                }
                            case "el":
                                {
                                    const sportId = +data[1].split(`${shard_l}_el`)[1];
                                    const delta = JSON.parse(data[2]);
                                    const patch = patchEventsList(1, sportId, delta);
                                    let out = {
                                        action: "sport-selected-update",
                                        payload: {
                                            storeLive: patch,
                                        },
                                    };
                                    for (let i = 0; i < window.frames.length; i++) {
                                        window.frames[i].postMessage(out, "*");
                                    }
                                    break;
                                }
                            case "match_p":
                            case "match_l":
                                {
                                    const id = data[1];
                                    let oddsDelta = JSON.parse(data[2]);
                                    if (oddsDelta === "reload") oddsDelta = {
                                        reload: 1
                                    };

                                    const matchId = eventMaps[id];
                                    if (!matchId) return;
                                    for (let marketId in oddsDelta) {
                                        if (marketStore[marketId] && oddsDelta[marketId]) {
                                            oddsDelta[marketId].sidp = id;
                                        }
                                    }

                                    if (pattern === "match_l") {
                                        setTimeout(() => {
                                            checkDelayedTicketFromFeed(matchId, oddsDelta);
                                            checkDelayedTicketFromFeed(`c1.${matchId}`, oddsDelta);
                                            checkDelayedTicketFromFeed(`c2.${matchId}`, oddsDelta);
                                        }, 1);
                                    }
                                    if (oddsDelta.timer ? .toString().includes("~")) delete oddsDelta.timer;
                                    oddsFeed[matchId] = oddsFeed[matchId] || {};
                                    oddsStore[matchId] = oddsStore[matchId] || {};

                                    if (extraMatchOpened) {
                                        if (extraMatchOpened === matchId) {
                                            if (oddsDelta.reload) {
                                                extraOddsFeed = {};
                                                extraOddsStore = {};
                                            }
                                            let oddsChange = {};
                                            for (let marketId in oddsDelta) {
                                                if (!extraOddsFeed[marketId] || extraOddsFeed[marketId].sidp === id) {
                                                    if (isDelta === 1) {
                                                        delta_update(extraOddsFeed[marketId], oddsDelta[marketId]);
                                                    } else {
                                                        extraOddsFeed[marketId] = oddsDelta[marketId];
                                                    }
                                                    oddsChange[marketId] = extraOddsFeed[marketId];
                                                }
                                            }
                                            // extraOddsFeed = { ...extraOddsFeed, ...oddsDelta };
                                            if (Object.keys(oddsChange).length > 0) {
                                                buildMatchOdds(oddsChange, extraOddsStore, matchId);
                                                let out = {
                                                    action: "extra-match-odds",
                                                    payload: {
                                                        extraOddsStore,
                                                        oddsChangeStore,
                                                    },
                                                };
                                                for (let i = 0; i < g.frames.length; i++) {
                                                    g.frames[i].postMessage(out, "*");
                                                }
                                            }
                                        }
                                    } else {
                                        let oddsChange = {};
                                        for (let marketId in oddsDelta) {
                                            if (!oddsFeed[matchId][marketId] || oddsFeed[matchId][marketId].sidp === id) {
                                                if (isDelta === 1) {
                                                    delta_update(oddsFeed[matchId][marketId], oddsDelta[marketId]);
                                                } else {
                                                    oddsFeed[matchId][marketId] = oddsDelta[marketId];
                                                }
                                                oddsChange[marketId] = oddsFeed[matchId][marketId];
                                            }
                                        }
                                        // oddsFeed[matchId] = { ...oddsFeed[matchId], ...oddsDelta };
                                        if (Object.keys(oddsChange).length > 0) {
                                            buildMatchOdds(oddsChange, oddsStore[matchId], matchId);
                                            let out = {
                                                action: "center-match-odds",
                                                payload: {
                                                    oddsStore,
                                                    oddsChangeStore,
                                                },
                                            };
                                            for (let i = 0; i < g.frames.length; i++) {
                                                g.frames[i].postMessage(out, "*");
                                            }
                                        }
                                    }
                                    if (betslipStore.matchById[matchId]) {
                                        let oddsChange = {};
                                        for (let marketId in oddsDelta) {
                                            if (!betslipOddsFeed[matchId][marketId] || betslipOddsFeed[matchId][marketId].sidp === id) {
                                                if (isDelta === 1) {
                                                    delta_update(betslipOddsFeed[matchId][marketId], oddsDelta[marketId]);
                                                } else {
                                                    betslipOddsFeed[matchId][marketId] = oddsDelta[marketId];
                                                }
                                                oddsChange[marketId] = betslipOddsFeed[matchId][marketId];
                                            }
                                        }
                                        //betslipOddsFeed[matchId] = { ...betslipOddsFeed[matchId], ...oddsDelta };
                                        if (Object.keys(oddsChange).length > 0) {
                                            buildMatchOdds(oddsChange, betslipOddsStore[matchId], matchId);
                                            updateBetslipStore();
                                        }
                                    }
                                    break;
                                }
                            case "conf":
                                {
                                    const temp = data[1].split("_");
                                    let model = +temp[0].substring(2);
                                    let type = temp[0].substring(0, 2);
                                    const config = data[2] && JSON.parse(data[2]);
                                    let prefix = "";
                                    if (type === "cp") {
                                        prefix = "p";
                                    } else if (type === "cl") {
                                        prefix = "l";
                                    }
                                    if (temp[0].includes("sts")) {
                                        prefix = "l";
                                        model = +temp[0].substring(3);
                                        type = temp[0].substring(0, 3);
                                        const matchId = `${prefix}${temp[1]}`;
                                        setTimeout(() => {
                                            checkDelayedTicketFromConf(matchId, config);
                                            checkDelayedTicketFromConf(`c1.${matchId}`, config);
                                            checkDelayedTicketFromConf(`c2.${matchId}`, config);
                                        }, 1);
                                    }
                                    const eventId = `${prefix}${temp[1]}`;
                                    // const typeId = temp.slice(1).join("_");
                                    for (let level in sportModel) {
                                        if (+sportModel[level] === +model) {
                                            if (!config && rawSportConfigStore[level][type]) delete rawSportConfigStore[level][type][eventId];
                                            if (!rawSportConfigStore[level][type] || !rawSportConfigStore[level][type][eventId]) continue;
                                            // rawSportConfigStore[level][type] = rawSportConfigStore[level][type] || {};
                                            // rawSportConfigStore[level][type][eventId] = rawSportConfigStore[level][type][eventId] || {};
                                            rawSportConfigStore[level][type][eventId] = {
                                                ...rawSportConfigStore[level][type][eventId],
                                                ...config,
                                            };

                                            // calculate sportConfigStore
                                            buildSportConfigStore();
                                            for (let widget in storeInView) {
                                                if (storeInView.hasOwnProperty(widget)) {
                                                    let matchInView = Object.keys(storeInView[widget].matches);
                                                    matchInView.forEach((matchId) => {
                                                        if (extraMatchOpened) {
                                                            extraOddsStore = {};
                                                            buildMatchOdds(extraOddsFeed, extraOddsStore, matchId);
                                                        } else {
                                                            oddsStore[matchId] = {};
                                                            buildMatchOdds(oddsFeed[matchId], oddsStore[matchId], matchId);
                                                        }
                                                        if (betslipStore.matchById[matchId]) {
                                                            betslipOddsStore[matchId] = {};
                                                            buildMatchOdds(betslipOddsFeed[matchId], betslipOddsStore[matchId], matchId);
                                                        }
                                                    });
                                                }
                                            }
                                            if (betslipStore.totalBets > 0) {
                                                updateBetslipStore();
                                            }
                                            if (extraMatchOpened) {
                                                let out = {
                                                    action: "extra-match-odds",
                                                    payload: {
                                                        extraOddsStore,
                                                        oddsChangeStore,
                                                    },
                                                };
                                                for (let i = 0; i < g.frames.length; i++) {
                                                    g.frames[i].postMessage(out, "*");
                                                }
                                            } else {
                                                let out = {
                                                    action: "center-match-odds",
                                                    payload: {
                                                        oddsStore,
                                                        oddsChangeStore,
                                                    },
                                                };
                                                for (let i = 0; i < g.frames.length; i++) {
                                                    g.frames[i].postMessage(out, "*");
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            case "ticket":
                                {
                                    let ticketId = data[1].substring(2);
                                    let ticketData = JSON.parse(data[2]);
                                    let msg = ticketData[1] ? `:${ticketData[1]}` : "";
                                    if (isNaN(+ticketId)) {
                                        clearTimeout(ticketHoldTimeout);
                                        pendingTicketId = undefined;
                                        if (ticketData.Error) {
                                            g.new_notification({
                                                type: "error",
                                                notif_for: "betslip",
                                                time: 5000,
                                                msg1: ticketData.Message,
                                            });
                                            return;
                                        }
                                        if (ticketData.Message === "ticket_submited") {
                                            await handleTicketSubmitted(ticketData);
                                            return;
                                        }
                                        if (+ticketData[0] === 0 && +ticketData[1]) {
                                            const delay = +ticketData[1] > 0 ? +ticketData[1] : 0;
                                            ticketResubmitTimeout = setTimeout(async () => {
                                                ticketResubmitTimeout = undefined;
                                                g.asyncPM({
                                                    action: "del-localStorage",
                                                    payload: {
                                                        param: "pendingTicket"
                                                    }
                                                });
                                                await finalSubmitTicket(ticketId);
                                            }, delay * 1000);
                                            return;
                                        }
                                        if (+ticketData[0] === 1) {
                                            // rejected
                                            pendingTicketId = undefined;
                                            ticketResubmitTimeout = undefined;
                                            g.asyncPM({
                                                action: "del-localStorage",
                                                payload: {
                                                    param: "pendingTicket"
                                                }
                                            });
                                            ticketProcessing = false;
                                            g.new_notification({
                                                type: "error",
                                                notif_for: "betslip",
                                                time: 5000,
                                                msg1: "ticket_rejected",
                                                msg2: ticketData[1],
                                            });
                                            return;
                                        }
                                        if (+ticketData[0] === 3) {
                                            const delay = +ticketData[1] > 0 ? +ticketData[1] : 0;
                                            setTimeout(() => {
                                                const {
                                                    odds = {}, stake, return_max
                                                } = ticketData[2];
                                                const ticketHeader = {
                                                    newTicket: 1,
                                                    state: -2,
                                                    round: ticketId,
                                                    ops: "",
                                                    stake: stake || betslipStore.stake,
                                                    return: return_max,
                                                    lines: []
                                                };
                                                for (const matchId in betslipStore.matchById) {
                                                    const {
                                                        home,
                                                        away,
                                                        betById
                                                    } = betslipStore.matchById[matchId];
                                                    const line = {
                                                        match: `${home} - ${away}`,
                                                        outcome_name: [],
                                                        specialbetvalue: [],
                                                        odd: []
                                                    };
                                                    for (const betId in betById) {
                                                        const {
                                                            marketName,
                                                            marketId,
                                                            outcomeId,
                                                            outcomeName,
                                                            sbvId,
                                                            odd
                                                        } = betById[betId];
                                                        const matchIdReal = matchId.startsWith("c") ? matchId.split(".")[1].substring(1) : matchId.substring(1);
                                                        const newOdd = odds[matchIdReal] ? .[marketId] ? .[sbvId] ? .[outcomeId];
                                                        line.outcome_name.push(`${marketName}~${outcomeName}`);
                                                        line.specialbetvalue.push(sbvId);
                                                        line.odd.push((newOdd || odd ? .odd) / 100);
                                                    }
                                                    ticketHeader.lines.push(line);
                                                }
                                                ticketStore.byId[ticketId] = ticketHeader;
                                                ticketStore.allIds.unshift(ticketId);
                                                let out = {
                                                    action: "betslip-store",
                                                    payload: {
                                                        betslipStore,
                                                        ticketStore
                                                    },
                                                };
                                                for (let i = 0; i < g.frames.length; i++) {
                                                    g.frames[i].postMessage(out, "*");
                                                }
                                                g.new_notification({
                                                    time: 5000,
                                                    msg1: "ticket_offered",
                                                });
                                            }, delay * 1000);
                                            return;
                                        }
                                        // P ts9G2XO1SAU4M [3,-14,{"odds":{"7247447":{"1001":{"s":{"2001":130}}},"7268743":{"1018":{"s2.5":{"2081":180}}}}}]
                                        // P ts FH7U3DLE5GI [3,-10,{"odds":{"7264729":{"1001":[{"2001":130}]}}}]
                                        spSocket.unSubscribe("ts", [ticketId]);
                                        return;
                                    }
                                    if (ticketStore.byId[ticketId]) {
                                        ticketProcessing = false;
                                        let state, notifType;
                                        if (+ticketData[0] === 1) {
                                            // rejected
                                            state = 4;
                                            notifType = "error";
                                        } else if (+ticketData[0] === 2) {
                                            // accepted
                                            state = 0;
                                            notifType = "success";
                                        } else if (+ticketData[0] === 3) {
                                            // offered
                                            state = 5;
                                        } else {
                                            state = ticketData[0];
                                            notifType = "success";
                                        }

                                        if (state === 0) {
                                            g.new_notification({
                                                type: notifType,
                                                notif_for: "betslip",
                                                time: 5000,
                                                msg1: ticketStore.byId[ticketId].round + "." + ticketStore.byId[ticketId].ops,
                                                msg2: g.userStore.ticket_states[ticketStore.byId[ticketId].state],
                                                ticketId: ticketStore.byId[ticketId].ticket_id,
                                                ticketHeader: ticketStore.byId[ticketId],
                                                ticketLines: ticketStore.byId[ticketId].ticketLines,
                                            });
                                        } else {
                                            g.new_notification({
                                                type: notifType,
                                                time: 5000,
                                                msg1: ticketStore.byId[ticketId].round + "." + ticketStore.byId[ticketId].ops,
                                                msg2: g.userStore.ticket_states[state] + msg,
                                            });
                                        }
                                        ticketStore.byId[ticketId].state = state;
                                        ticketStore.byId[ticketId].reason = ticketData[1];
                                        spSocket.unSubscribe("ts", [ticketId]);
                                        if (state === 5) {
                                            ticketId = ticketData[1];
                                            const _data = await g.platformApiCall(`.in?action=get&subaction=ticket&ticket_id=${ticketId}`, "json", {}, "api", "json", 1);
                                            const {
                                                ticketHeader
                                            } = await g.buildTicketDetails(_data.data.ticket_data, _data.schema.ticket_header, _data.data.ticket_lines, _data.schema.lines_header);
                                            ticketHeader["pay_code"] = ticketData[2];
                                            ticketHeader.lines = ticketHeader.ticketLines;
                                            // ticketHeader["bonus_voucher"] = _data.bonus_voucher;
                                            ticketStore.byId[ticketId] = ticketHeader;
                                            ticketStore.allIds.unshift(ticketId);

                                            let out = {
                                                action: "betslip-store",
                                                payload: {
                                                    betslipStore,
                                                    ticketStore
                                                },
                                            };
                                            for (let i = 0; i < g.frames.length; i++) {
                                                g.frames[i].postMessage(out, "*");
                                            }
                                            spSocket.subscribe("ts", [ticketId]);
                                            let new_offer_timeout = 20;
                                            if (g.userStore.parameters.new_offer_timeout) {
                                                new_offer_timeout = g.userStore.parameters.new_offer_timeout;
                                            }
                                            setTimeout(() => {
                                                if (+ticketStore.byId[ticketId].state === -2) {
                                                    ticketStore.byId[ticketId].state = 4;
                                                    let out = {
                                                        action: "betslip-store",
                                                        payload: {
                                                            betslipStore,
                                                            ticketStore
                                                        },
                                                    };
                                                    for (let i = 0; i < g.frames.length; i++) {
                                                        g.frames[i].postMessage(out, "*");
                                                    }
                                                }
                                            }, new_offer_timeout * 1000);
                                        }
                                        updateBetslipStore();
                                    }
                                    break;
                                }
                            default:
                                break;
                        }
                    }, 0);
                };
                webSocket.onopen = function() {
                    // TODO: do something on socket open
                    socket.connected = true;
                };
                webSocket.onclose = function() {
                    console.log("disconnected");
                    socket.connected = false;
                    const out = {
                        action: "socket_disconnected",
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(out, "*");
                    }
                    if (ticketProcessing) {
                        g.new_notification({
                            type: "info",
                            time: 300000,
                            msg1: "socket_disconnected",
                            msg2: "please_reload",
                        });
                    }
                    // g.new_notification({
                    //   type: "info",
                    //   time: 5000,
                    //   msg1: "socket_disconnected",
                    // });
                    // socketInfo[socketNr].status = 'disconnected';
                    // TODO: check if switchSocket needed
                };
                webSocket.onerror = function() {
                    console.log("socket_error");

                    // TODO: do something on socket error
                };
                return webSocket;
            } catch (err) {
                console.log(err);
            }
        }

        function channelPattern(type, header, shard_p, shard_l) {
            const {
                shard
            } = g.domainConfigs;
            switch (type) {
                case "INFO":
                    {
                        if (header === "PUB") return {
                            pattern: "info_pub",
                            isDelta: 0
                        };
                        return {};
                    }
                case "P":
                    {
                        if (header.indexOf("s1_l") === 0) return {
                            pattern: "match_l",
                            isDelta: 0
                        };
                        if (header.indexOf("s2_l") === 0) return {
                            pattern: "match_l",
                            isDelta: 0
                        };
                        if (header.indexOf("s3_l") === 0) return {
                            pattern: "match_l",
                            isDelta: 0
                        };
                        if (header.indexOf("s5_l") === 0) return {
                            pattern: "match_l",
                            isDelta: 1
                        };

                        if (header.indexOf("c") === 0) return {
                            pattern: "conf",
                            isDelta: 0
                        };
                        if (header.indexOf("sts") === 0) return {
                            pattern: "conf",
                            isDelta: 0
                        };
                        if (header.indexOf(`${shard_l}_sl`) === 0) return {
                            pattern: "sl",
                            isDelta: 0
                        };
                        if (header.indexOf(`${shard_p}_sp`) === 0) return {
                            pattern: "sp",
                            isDelta: 0
                        };
                        if (header.indexOf(`${shard_l}_el`) === 0) return {
                            pattern: "el",
                            isDelta: 0
                        };
                        if (header.indexOf(`${shard_p}_ep`) === 0) return {
                            pattern: "ep",
                            isDelta: 0
                        };
                        if (header.indexOf("ts") === 0) return {
                            pattern: "ticket",
                            isDelta: 0
                        };

                        if (header.indexOf("s1_p") === 0) return {
                            pattern: "match_p",
                            isDelta: 0
                        };
                        if (header.indexOf("s2_p") === 0) return {
                            pattern: "match_p",
                            isDelta: 0
                        };
                        if (header.indexOf("s3_p") === 0) return {
                            pattern: "match_p",
                            isDelta: 0
                        };
                        if (header.indexOf("s4_p") === 0) return {
                            pattern: "match_p",
                            isDelta: 0
                        };
                        if (header.indexOf("s5_p") === 0) return {
                            pattern: "match_p",
                            isDelta: 1
                        };
                        if (header.indexOf(`s0${shard}_p`) === 0) return {
                            pattern: "match_p",
                            isDelta: 0
                        };

                        // if (!isNaN(+header)) return "ticket";
                        return {};
                    }
                default:
                    return {};
            }
        }

        selectedSocket = await socketConnect();

        socket.reconnect = () => {
            getSocketAuth().then((auth) => {
                selectedSocket = socketConnect(auth.token, auth.time);
            });
        };

        socket.subscribe = (channel, events, maps) => {
            // if (window.location.host.includes("devel")) return;
            eventMaps = { ...eventMaps,
                ...maps
            };
            if (!socketReady) {
                subscriptions.push([channel, events]);
            } else {
                let subscribeQuery = "";
                if (events) {
                    if (Array.isArray(events)) {
                        if (events.length === 0) {
                            return;
                        }
                        subscribeQuery += channel;
                        subscribeQuery += events.join(";" + channel);
                    } else {
                        if (Object.keys(events).length === 0) {
                            return;
                        }
                        for (let eventId in events) {
                            const mappedId = eventMaps[eventId];
                            let filtersArray = [...events[eventId]];
                            for (let widget in storeInView) {
                                if (storeInView[widget].matches[mappedId]) {
                                    storeInView[widget].matches[mappedId].forEach((filter) => {
                                        if (filtersArray.indexOf(filter) === -1) {
                                            filtersArray.push(filter);
                                        }
                                    });
                                }
                            }
                            if (subscribeQuery !== "") {
                                subscribeQuery += ";";
                            }
                            if (filtersArray.indexOf("a") > -1) {
                                filtersArray = ["a"];
                            }
                            subscribeQuery += channel + eventId;
                            subscribeQuery += ":" + filtersArray.join(",");
                        }
                    }
                } else {
                    subscribeQuery += channel;
                }
                if (socket.connected) {
                    selectedSocket.send("SUB\u001F" + subscribeQuery);
                }
            }
        };

        socket.unSubscribe = (channel, events) => {
            // if (!socketReady) {
            let subscribeQuery = "";
            let unsubscribeQuery = "";
            if (events.length === 0) {
                return;
            }
            events.forEach((eventId) => {
                const mappedId = eventMaps[eventId];
                let filtersArray = [];
                for (let widget in storeInView) {
                    if (storeInView[widget].matches[mappedId]) {
                        storeInView[widget].matches[mappedId].forEach((filter) => {
                            if (filtersArray.indexOf(filter) === -1) {
                                filtersArray.push(filter);
                            }
                        });
                    }
                }
                if (filtersArray.length === 0) {
                    if (unsubscribeQuery !== "") {
                        unsubscribeQuery += ";";
                    }
                    unsubscribeQuery += channel + eventId;
                    delete eventMaps[eventId];
                } else {
                    if (subscribeQuery !== "") {
                        subscribeQuery += ";";
                    }
                    if (filtersArray.indexOf("a") > -1) {
                        filtersArray = ["a"];
                    }
                    subscribeQuery += channel + eventId;
                    subscribeQuery += ":" + filtersArray.join(",");
                }
            });
            if (unsubscribeQuery !== "" && socket.connected) {
                selectedSocket.send("UNSUB\u001F" + unsubscribeQuery);
            }
            if (subscribeQuery !== "" && socket.connected) {
                selectedSocket.send("SUB\u001F" + subscribeQuery);
            }
            // }
        };

        socket.unSubscribeAll = () => {};
        socket.switchSocket = () => {};
        return socket;
    }

    function checkDelayedTicketFromFeed(matchId, delta) {
        if (!ticketResubmitTimeout) return;
        if (!betslipStore.matchById[matchId]) return;
        const {
            home,
            away
        } = betslipStore.matchById[matchId];
        // const { state, score, corner, redc, yelc, ...oddChanges } = delta;
        const {
            state,
            score,
            corner,
            redc,
            yelc,
            ...oddChanges
        } = delta;
        if (+state === 1) {
            if (ticketResubmitTimeout < 0 && pendingTicketId) {
                g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                clearTimeout(ticketHoldTimeout);
                pendingTicketId = undefined;
                g.asyncPM({
                    action: "del-localStorage",
                    payload: {
                        param: "pendingTicket"
                    }
                });
            }
            clearTimeout(ticketResubmitTimeout);
            ticketResubmitTimeout = undefined;
            ticketProcessing = false;
            g.new_notification({
                type: "error",
                notif_for: "betslip",
                time: 5000,
                msg1: "error_event_blocked",
                msg2: `${home} - ${away}`,
            });
            return;
        }
        const matchIdReal = matchId.toString().startsWith("c1") ? matchId.substring(3) : matchId;
        const {
            sportId
        } = matchStore[matchIdReal];
        if (+sportId !== 1) return;
        if (score) {
            if (ticketResubmitTimeout < 0 && pendingTicketId) {
                g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                clearTimeout(ticketHoldTimeout);
                pendingTicketId = undefined;
                g.asyncPM({
                    action: "del-localStorage",
                    payload: {
                        param: "pendingTicket"
                    }
                });
            }
            clearTimeout(ticketResubmitTimeout);
            ticketResubmitTimeout = undefined;
            ticketProcessing = false;
            g.new_notification({
                type: "error",
                notif_for: "betslip",
                time: 5000,
                msg1: "error_event_blocked",
                msg2: `${home} - ${away}`,
            });
            return;
        }
        if (corner) {
            for (const betId in betslipStore.matchById[matchId].betById) {
                const {
                    marketId
                } = betslipStore.matchById[matchId].betById[betId];
                const {
                    type
                } = marketStore[marketId];
                if (type === "corner") {
                    if (ticketResubmitTimeout < 0 && pendingTicketId) {
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                        clearTimeout(ticketHoldTimeout);
                        pendingTicketId = undefined;
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    ticketProcessing = false;
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: "error_event_blocked",
                        msg2: `${home} - ${away}`,
                    });
                    return;
                }
            }
        }
        if (redc || yelc) {
            for (const betId in betslipStore.matchById[matchId].betById) {
                const {
                    marketId
                } = betslipStore.matchById[matchId].betById[betId];
                const {
                    type
                } = marketStore[marketId];
                if (type === "cards") {
                    if (ticketResubmitTimeout < 0 && pendingTicketId) {
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                        clearTimeout(ticketHoldTimeout);
                        pendingTicketId = undefined;
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    ticketProcessing = false;
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: "error_event_blocked",
                        msg2: `${home} - ${away}`,
                    });
                    return;
                }
            }
        }
        //   market_check_feed_stop

        if (+g.userStore ? .parameters ? .market_check_feed_stop) {
            // allow market changes
            for (const prop in oddChanges) {
                if (typeof delta[prop] !== "object") continue;
                for (const betId in betslipStore.matchById[matchId].betById) {
                    const bet = betslipStore.matchById[matchId].betById[betId];
                    const {
                        marketId,
                        sbvId,
                        outcomeId,
                        marketName,
                        outcomeName
                    } = bet;
                    if (prop.toString() !== marketId.toString()) continue;
                    if (Object.keys(delta[prop]).length === 0) {
                        clearTimeout(ticketResubmitTimeout);
                        ticketResubmitTimeout = undefined;
                        ticketProcessing = false;
                        g.new_notification({
                            type: "error",
                            notif_for: "betslip",
                            time: 5000,
                            msg1: "error_event_market_blocked",
                            msg2: `${home} - ${away} : ${marketName}`,
                        });
                        return;
                    }
                    for (const s in delta[prop]) {
                        if (s !== sbvId) continue;
                        const {
                            s: sbvState,
                            ...outcomes
                        } = delta[prop][s];
                        if (+sbvState === 1) {
                            clearTimeout(ticketResubmitTimeout);
                            ticketResubmitTimeout = undefined;
                            ticketProcessing = false;
                            g.new_notification({
                                type: "error",
                                notif_for: "betslip",
                                time: 5000,
                                msg1: "error_event_market_blocked",
                                msg2: `${home} - ${away} : ${marketName}:${s}`,
                            });
                            return;
                        }
                        for (const oid in outcomes) {
                            if (oid.toString() !== outcomeId.toString()) continue;
                            if (!Array.isArray(outcomes[oid]) || !outcomes[oid][0] || +outcomes[oid][1] === 1) {
                                clearTimeout(ticketResubmitTimeout);
                                ticketResubmitTimeout = undefined;
                                ticketProcessing = false;
                                g.new_notification({
                                    type: "error",
                                    notif_for: "betslip",
                                    time: 5000,
                                    msg1: "error_event_odd_blocked",
                                    msg2: `${home} - ${away} : ${marketName}:${s}:${outcomeName}`,
                                });
                                return;
                            }
                        }
                    }
                }
            }
        }
    }

    function checkDelayedTicketFromConf(matchId, delta) {
        if (!ticketResubmitTimeout) return;
        if (!betslipStore.matchById[matchId]) return;
        const {
            home,
            away
        } = betslipStore.matchById[matchId];
        for (const prop in delta) {
            if (delta[prop] === null) continue;
            if (+prop === -2) {
                if (ticketResubmitTimeout < 0 && pendingTicketId) {
                    g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                    pendingTicketId = undefined;
                    g.asyncPM({
                        action: "del-localStorage",
                        payload: {
                            param: "pendingTicket"
                        }
                    });
                }
                clearTimeout(ticketResubmitTimeout);
                ticketResubmitTimeout = undefined;
                ticketProcessing = false;
                g.new_notification({
                    type: "error",
                    notif_for: "betslip",
                    time: 5000,
                    msg1: "error_event_blocked",
                    msg2: `${home} - ${away}`,
                });
                return;
            }
            for (const betId in betslipStore.matchById[matchId].betById) {
                const bet = betslipStore.matchById[matchId].betById[betId];
                const {
                    marketId,
                    sbvId,
                    outcomeId,
                    marketName,
                    outcomeName
                } = bet;
                if (`l${marketId}_${sbvId.substring(1)}_${outcomeId}` === prop) {
                    if (ticketResubmitTimeout < 0 && pendingTicketId) {
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                        clearTimeout(ticketHoldTimeout);
                        pendingTicketId = undefined;
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    ticketProcessing = false;
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: "error_event_odd_blocked",
                        msg2: `${home} - ${away} : ${marketName}:${sbvId.substring(1)}:${outcomeName}`,
                    });
                    return;
                }
                if (`l${marketId}_${sbvId.substring(1)}` === prop) {
                    if (ticketResubmitTimeout < 0 && pendingTicketId) {
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                        clearTimeout(ticketHoldTimeout);
                        pendingTicketId = undefined;
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    ticketProcessing = false;
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: "error_event_market_blocked",
                        msg2: `${home} - ${away} : ${marketName}:${sbvId.substring(1)}`,
                    });
                    return;
                }
                if (`l${marketId}` === prop) {
                    if (ticketResubmitTimeout < 0 && pendingTicketId) {
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${pendingTicketId}&reason=feed_stop`, "json", {}, "api", "json", 2);
                        clearTimeout(ticketHoldTimeout);
                        pendingTicketId = undefined;
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    ticketProcessing = false;
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: "error_event_market_blocked",
                        msg2: `${home} - ${away} : ${marketName}`,
                    });
                    return;
                }
            }
        }
    }

    function patchEventsList(live, sportId, data) {
        const type = +live ? "sc_el" : "sc_ep";
        try {
            for (const m in data) {
                if (!data[m]) {
                    delete rawStore[type] ? .[sportId] ? .[m];
                    continue;
                }
                rawStore[type] = rawStore[type] || {};
                rawStore[type][sportId] = rawStore[type][sportId] || {};
                rawStore[type][sportId] = { ...rawStore[type][sportId],
                    [m]: data[m]
                };
            }
        } catch (e) {
            console.log(e);
        }
        return buildSportSelected(sportId, rawStore[type][sportId], live);
    }

    function buildSportConfigStore() {
        if (rawSportConfigStore.l) {
            for (let type in rawSportConfigStore.l) {
                if (sportConfigStore[type]) {
                    for (let eventId in rawSportConfigStore.l[type]) {
                        if (sportConfigStore[type][eventId]) {
                            for (let m in rawSportConfigStore.l[type][eventId]) {
                                sportConfigStore[type][eventId][m] = {
                                    ...sportConfigStore[type][eventId][m],
                                    ...rawSportConfigStore.l[type][eventId][m],
                                };
                            }
                        } else {
                            sportConfigStore[type][eventId] = rawSportConfigStore.l[type][eventId];
                        }
                    }
                } else {
                    sportConfigStore[type] = rawSportConfigStore.l[type];
                }
            }
        }
        if (rawSportConfigStore.m) {
            for (let type in rawSportConfigStore.m) {
                if (sportConfigStore[type]) {
                    for (let eventId in rawSportConfigStore.m[type]) {
                        if (sportConfigStore[type][eventId]) {
                            for (let m in rawSportConfigStore.m[type][eventId]) {
                                sportConfigStore[type][eventId][m] = {
                                    ...sportConfigStore[type][eventId][m],
                                    ...rawSportConfigStore.m[type][eventId][m],
                                };
                            }
                        } else {
                            sportConfigStore[type][eventId] = rawSportConfigStore.m[type][eventId];
                        }
                    }
                } else {
                    sportConfigStore[type] = rawSportConfigStore.m[type];
                }
            }
        }
        if (rawSportConfigStore.h) {
            for (let type in rawSportConfigStore.h) {
                if (sportConfigStore[type]) {
                    for (let eventId in rawSportConfigStore.h[type]) {
                        if (sportConfigStore[type][eventId]) {
                            for (let m in rawSportConfigStore.h[type][eventId]) {
                                sportConfigStore[type][eventId][m] = {
                                    ...sportConfigStore[type][eventId][m],
                                    ...rawSportConfigStore.h[type][eventId][m],
                                };
                            }
                        } else {
                            sportConfigStore[type][eventId] = rawSportConfigStore.h[type][eventId];
                        }
                    }
                } else {
                    sportConfigStore[type] = rawSportConfigStore.h[type];
                }
            }
        }
    }

    function buildSportList(data, live) {
        let sportById = {};
        let sportAllIds = [];
        for (let sportId in data) {
            if (data.hasOwnProperty(sportId)) {
                if (
                    live &&
                    g.userStore &&
                    g.userStore.parameters &&
                    g.userStore.parameters.disabled_sports_live &&
                    g.userStore.parameters.disabled_sports_live.split(",").includes(sportId + "")
                ) {
                    continue;
                }
                if (!live &&
                    g.userStore &&
                    g.userStore.parameters &&
                    g.userStore.parameters.disabled_sports_prematch &&
                    g.userStore.parameters.disabled_sports_prematch.split(",").includes(sportId + "")
                ) {
                    continue;
                }
                let skip = false;
                if (sportConfigStore["cs"][sportId] && sportConfigStore["cs"][sportId][live ? -4 : -3] && sportConfigStore["cs"][sportId][live ? -4 : -3]["s"] * 1) {
                    skip = true;
                }
                for (let type in sportConfigStore) {
                    if (type !== "cs") {
                        for (let eId in sportConfigStore[type]) {
                            if (sportConfigStore[type][eId] && sportConfigStore[type][eId][live ? -4 : -3] && +sportConfigStore[type][eId][live ? -4 : -3].sportId === +sportId) {
                                if (sportConfigStore[type][eId][live ? -4 : -3]["s"] * 1 === 0) {
                                    skip = false;
                                }
                            }
                        }
                    }
                }
                if (skip) {
                    continue;
                }
                let sport = data[sportId];
                sportAllIds.push(sportId);
                sportById[sportId] = {
                    name: sport[1],
                    position: sport[0],
                    nr_match: sport[2],
                };
            }
        }
        const sortedSportIds = sportAllIds.sort((a, b) => sportById[a].position - sportById[b].position);
        return {
            sportById: sportById,
            sportAllIds: sortedSportIds,
        };
    }

    function buildSportSelected(sportId, data, live) {
        let sportSelectedAllIds = [sportId];
        let sportSelectedCategAllIds = {
            [sportId]: []
        };
        let categAllIds = [];
        let categById = {};
        let tourById = {};
        let matchById = {};
        let availableDates = [];
        let allMatches = [];
        let groups = {
            byId: {},
            allIds: []
        };
        for (let matchId in data) {
            const {
                a,
                c: [c, cn, cp, cc] = [],
                g: groupId = -1,
                h,
                ts,
                co,
                t: [t, tn, tp] = [],
                s,
                map
            } = data[matchId];
            matchId = `${live ? "l" : "p"}${matchId}`;
            if (!c || !t || +s === 1) continue;
            const type = live ? -4 : -3;
            const tempConfig = calculateGlobalConfig(sportId, +c, +groupId, +t, type);
            if (+tempConfig.s) continue;
            if (!live && tempConfig.days2bet && (ts - Date.now() / 1000) / 86400 > tempConfig.days2bet) continue;
            if (!categById[c]) {
                categById[c] = {
                    name: cn,
                    flag: cc,
                    pos: cp,
                    tourAllIds: []
                };
                categAllIds.push(c);
            }
            if (!groups.byId[groupId]) {
                groups.byId[groupId] = {
                    name: `g${groupId}`,
                    tourAllIds: []
                };
                groups.allIds.push(groupId);
            }
            const date = live ? g.moment().format("YYYY-MM-DD") : g.moment(ts * 1000).format("YYYY-MM-DD");
            const sDate = live ? g.moment().format("L") : g.moment(ts * 1000).format("L");
            if (!tourById[t]) {
                tourById[t] = {
                    name: tn,
                    pos: tp,
                    dateAllIds: [],
                    dateById: {},
                    groupId: groupId,
                    categId: c,
                    matchAllIds: []
                };
                categById[c].tourAllIds.push(t);
                groups.byId[groupId].tourAllIds.push(t);
            }
            if (!availableDates.includes(date)) {
                availableDates.push(date);
            }
            if (!tourById[t].dateById[sDate]) {
                tourById[t].dateById[sDate] = [matchId];
                tourById[t].dateAllIds.push(date);
            } else {
                tourById[t].dateById[sDate].push(matchId);
            }
            tourById[t].matchAllIds.push(matchId);

            matchById[matchId] = {
                ...matchById[matchId],
                timestamp: ts,
                date: g.moment(ts * 1000).format("L"),
                time: g.moment(ts * 1000).format("HH:mm"),
                home: h.toString(),
                away: a.toString(),
                code: co,
                sportId: sportId,
                categId: Number(c),
                tourId: Number(t),
                groupId: Number(groupId),
                live,
                feeds: {},
                map,
                extra: {
                    s_id: Object.keys(map)[0]
                },
            };
            matchStore[matchId] = { ...matchById[matchId]
            };

            if (!allMatches.includes(matchId)) {
                allMatches.push(matchId);
            }
        }

        // Sort collections
        sportSelectedCategAllIds[sportId] = categAllIds.sort((x, y) => categById[x].pos - categById[y].pos);
        for (const categId in categById) {
            categById[categId].tourAllIds = categById[categId].tourAllIds.sort((x, y) => tourById[x].pos - tourById[y].pos);
        }
        for (const tourId in tourById) {
            tourById[tourId].dateAllIds = tourById[tourId].dateAllIds.sort().map((d) => g.moment(d).format("L"));
            for (const dateId in tourById[tourId].dateById) {
                tourById[tourId].dateById[dateId] = tourById[tourId].dateById[dateId].sort((x, y) => matchById[x].timestamp - matchById[y].timestamp);
            }
        }
        availableDates = availableDates.sort().map((d) => g.moment(d).format("L"));

        return {
            sportSelectedAllIds: sportSelectedAllIds,
            sportSelectedCategAllIds: sportSelectedCategAllIds,
            categById: categById,
            tourById: tourById,
            matchById: matchById,
            availableDates,
            allMatches: allMatches.sort((a, b) => matchStore[a].timestamp - matchStore[b].timestamp),
        };
    }

    function buildMarkets(sportId, data, src) {
        let marketAllIds = {};
        let marketById = {};
        let mAllIds = [];
        for (let marketId in data) {
            if (data.hasOwnProperty(marketId) && Object.keys(data[marketId][2]).length) {
                let market = data[marketId];
                let outcomeAllIds = [];
                let outcomeById = {};
                for (let outcomeId in market[2]) {
                    if (market[2].hasOwnProperty(outcomeId)) {
                        let outcome = market[2][outcomeId];
                        outcomeById[outcomeId] = {
                            position: outcome[0],
                            name: outcome[1].toString(),
                            code: outcome[2],
                        };
                        if (+g.domainConfigs["market_codes"]) outcomeById[outcomeId].code = "c";
                        outcomeAllIds.push(outcomeId);
                    }
                }
                const sortedOutcomeAllIds = outcomeAllIds.sort((a, b) => outcomeById[a].position - outcomeById[b].position);
                marketById[marketId] = {
                    position: market[0],
                    name: market[1],
                    outcomeById: outcomeById,
                    outcomeAllIds: sortedOutcomeAllIds,
                    hasSbv: !!market[3],

                    // parlay: (market[4] && market[4] === 'corner') ? true : false,
                    src,
                };
                if (market[4]) {
                    marketById[marketId].type = market[4];
                    if (market[4] === "corner") {
                        marketById[marketId].parlay = 1;
                    }
                    if (market[4] === "cards") {
                        marketById[marketId].parlay = 2;
                    }
                    if (market[4] === "parlay") {
                        //console.log(market);
                        marketById[marketId].parlay = 3;
                    }
                }
                mAllIds.push(marketId);
            }
        }
        marketStore = { ...marketStore,
            ...marketById
        };
        marketAllIds[sportId] = mAllIds.sort((a, b) => marketById[a].position - marketById[b].position);
        return {
            marketById: marketById,
            marketAllIds: marketAllIds,
        };
    }

    function buildMarketFilterStore(data) {
        marketFilterStore = data;
    }

    async function getSportCollection(sportId) {
        const lang = g.userStore.userLang ? g.userStore.userLang : "en";
        let savedMarkets = false;
        let savedTranslations = false;
        rawStore = {};
        tempStore = {
            sportSelectedAllIds: [],
            marketGroups: [],
        };
        tempStoreLive = {
            sportSelectedAllIds: [],
            marketGroups: [],
        };

        try {
            const temp = await g.asyncPM({
                action: "get-sessionStorage",
                payload: {
                    param: `cm${sportId}`
                }
            });
            if (temp) {
                const {
                    marketById,
                    marketAllIds
                } = JSON.parse(temp);

                tempStore.marketById = marketById;
                tempStore.marketAllIds = {
                    [sportId]: marketAllIds
                };
                tempStoreLive.marketById = marketById;
                tempStoreLive.marketAllIds = {
                    [sportId]: marketAllIds
                };
                marketStore = { ...marketStore,
                    ...marketById
                };

                const temp2 = await g.asyncPM({
                    action: "get-sessionStorage",
                    payload: {
                        param: `ctm${sportId}_${lang}`
                    }
                });
                const translations = JSON.parse(temp2);
                tempStore.marketTranslation = translations;
                tempStoreLive.marketTranslation = translations;

                savedMarkets = true;
            }
        } catch (e) {
            console.log(e.message);
        }

        try {
            const temp2 = await g.asyncPM({
                action: "get-sessionStorage",
                payload: {
                    param: `ctm${sportId}_${lang}`
                }
            });
            if (temp2) {
                const translations = JSON.parse(temp2);
                tempStore.marketTranslation = translations;
                tempStoreLive.marketTranslation = translations;

                for (let key in translations) {
                    if (marketStore[key]) {
                        marketStore[key] = { ...marketStore[key],
                            ...translations[key]
                        };
                    }
                }

                savedTranslations = true;
            }
        } catch (e) {
            console.log(e.message);
        }
        const {
            shard,
            elId_prematch,
            elId_live
        } = g.domainConfigs;

        const cKeys = [
            `${shard}${elId_prematch || ""}_sp`,
            `${shard}${elId_live || ""}_sl`,
            `${shard}${elId_prematch || ""}_ep${sportId}`,
            `${shard}${elId_live || ""}_el${sportId}`,
            `${shard}_mf${sportId}`,
        ];

        if (!savedMarkets) {
            cKeys.push(`${shard}_cm${sportId}`, `${shard}_cm100`);
        }
        if (!savedTranslations) {
            cKeys.push(`${shard}_ctm${sportId}_${lang}`, `${shard}_ctmp100_${lang}`);
        }
        const keys = [...cKeys];
        for (let level in sportModel) {
            if (+sportModel[level] !== -1) {
                keys.push(`${shard}_cels` + sportModel[level]);
                keys.push(`${shard}_celc` + sportModel[level]);
                keys.push(`${shard}_celg` + sportModel[level]);
                keys.push(`${shard}_celt` + sportModel[level]);
            }
        }
        let dataToSend = [
            ["ga", keys]
        ];
        const data = await g.platformApiCall("", "json", dataToSend, "nrdst", "json", 0);
        let [sp, sl, ep, el, mf, mp, mp100, tmp, tmp100] = cKeys.map((k, i) => data[i][k] || {});
        if (savedMarkets) {
            tmp = mp;
            tmp100 = mp100;
        }
        // get -3,-4 config for els,elc,elg,elt
        let i = cKeys.length;
        for (const level in sportModel) {
            if (+sportModel[level] !== -1) {
                if (data[i][`${shard}_cels${sportModel[level]}`] && data[i][`${shard}_cels${sportModel[level]}`] !== "failed") {
                    rawSportConfigStore[level].cs = data[i][`${shard}_cels${sportModel[level]}`];
                }
                i++;
                if (data[i][`${shard}_celc${sportModel[level]}`] && data[i][`${shard}_celc${sportModel[level]}`] !== "failed") {
                    const temp = data[i][`${shard}_celc${sportModel[level]}`];
                    for (const id in temp) {
                        for (const typeId in temp[id]) {
                            const [sportId, config] = temp[id][typeId];
                            temp[id][typeId] = {
                                sportId,
                                ...config
                            };
                        }
                    }
                    rawSportConfigStore[level].cc = temp;
                }
                i++;
                if (data[i][`${shard}_celg${sportModel[level]}`] && data[i][`${shard}_celg${sportModel[level]}`] !== "failed") {
                    const temp = data[i][`${shard}_celg${sportModel[level]}`];
                    for (const id in temp) {
                        for (const typeId in temp[id]) {
                            const [sportId, config] = temp[id][typeId];
                            temp[id][typeId] = {
                                sportId,
                                ...config
                            };
                        }
                    }
                    rawSportConfigStore[level].cg = temp;
                }
                i++;
                if (data[i][`${shard}_celt${sportModel[level]}`] && data[i][`${shard}_celt${sportModel[level]}`] !== "failed") {
                    const temp = data[i][`${shard}_celt${sportModel[level]}`];
                    for (const id in temp) {
                        for (const typeId in temp[id]) {
                            const [sportId, config] = temp[id][typeId];
                            temp[id][typeId] = {
                                sportId,
                                ...config
                            };
                        }
                    }
                    rawSportConfigStore[level].ct = temp;
                }
                i++;
            }
        }
        // calculate sportConfigStore
        buildSportConfigStore();

        if (sp) {
            rawStore["sc_sp"] = sp;
            const sportList = buildSportList(sp, 0);
            tempStore = {
                ...tempStore,
                ...sportList,
            };
        }
        if (sl) {
            rawStore["sc_sl"] = sl;
            const sportListLive = buildSportList(sl, 1);
            tempStoreLive = {
                ...tempStoreLive,
                ...sportListLive,
            };
        }
        if (ep) {
            if (tempStore.sportById[sportId]) {
                rawStore["sc_ep"] = {
                    [sportId]: ep
                };
                const sportSelected = buildSportSelected(sportId, ep, 0);
                tempStore = {
                    ...tempStore,
                    ...sportSelected,
                };
            }
        }
        if (el) {
            if (tempStoreLive.sportById[sportId]) {
                rawStore["sc_el"] = {
                    [sportId]: el
                };
                const sportSelectedLive = buildSportSelected(sportId, el, 1);
                tempStoreLive = {
                    ...tempStoreLive,
                    ...sportSelectedLive,
                };
            }
        }
        if (mf) {
            buildMarketFilterStore(mf);
        }
        if (!savedMarkets) {
            if (mp) {
                rawStore["cmp"] = {
                    [sportId]: mp
                };
                const markets = buildMarkets(sportId, mp);
                tempStore = {
                    ...tempStore,
                    ...markets,
                };
                rawStore["cml"] = {
                    [sportId]: mp
                };
                tempStoreLive = {
                    ...tempStoreLive,
                    ...markets,
                };
            }
            if (mp100) {
                rawStore["cmp"][sportId] = {
                    ...rawStore["cmp"][sportId],
                    ...mp100,
                };
                const markets = buildMarkets(sportId, mp100, 1);
                const tempMarketById = { ...tempStore.marketById,
                    ...markets.marketById
                };
                const tempMarketAllIds = [...tempStore.marketAllIds[sportId], ...markets.marketAllIds[sportId]].sort((a, b) => tempMarketById[a].position - tempMarketById[b].position);
                tempStore = {
                    ...tempStore,
                    marketById: tempMarketById,
                    marketAllIds: {
                        [sportId]: tempMarketAllIds,
                    },
                };
                const marketsToSave = {
                    marketById: tempMarketById,
                    marketAllIds: tempMarketAllIds
                };
                g.asyncPM({
                    action: "set-sessionStorage",
                    payload: {
                        param: `cm${sportId}`,
                        value: JSON.stringify(marketsToSave)
                    },
                });
            }
        }

        if (tmp) {
            rawStore["ctmp"] = {
                [sportId + "_" + lang]: tmp,
            };
            const marketTranslation = buildMarketsTranslation(tmp);
            tempStore = {
                ...tempStore,
                ...marketTranslation,
            };
            rawStore["ctml"] = {
                [sportId + "_" + lang]: tmp,
            };
            tempStoreLive = {
                ...tempStoreLive,
                ...marketTranslation,
            };
            g.asyncPM({
                action: "set-sessionStorage",
                payload: {
                    param: `ctm${sportId}_${lang}`,
                    value: JSON.stringify(tempStore.marketTranslation)
                },
            });
        }
        if (tmp100) {
            rawStore["ctmp"] = {
                [sportId + "_" + lang]: tmp100,
            };
            const marketTranslation = buildMarketsTranslation(tmp100);
            tempStore = {
                ...tempStore,
                marketTranslation: {
                    ...tempStore.marketTranslation,
                    ...marketTranslation.marketTranslation,
                },
            };
            g.asyncPM({
                action: "set-sessionStorage",
                payload: {
                    param: `ctm${sportId}_${lang}`,
                    value: JSON.stringify(tempStore.marketTranslation)
                },
            });
        }

        g.tempStore = tempStore;
        g.tempStoreLive = tempStoreLive;
    }

    async function getLocalMarketGroups() {
        if (localMarketGroupsLoaded) return;
        const fileName = g.params && g.params.includes("screen") ? "screenlive_markets.json" : "market_groups.json";
        const data = await getJsonFile(fileName);
        marketsList = data;
        localMarketGroups = data;
        localMarketGroupsLoaded = true;
    }

    async function getJsonFile(fileName) {
        const {
            skin_path,
            json_configs_path
        } = g.domainConfigs;
        if (!skin_path && !json_configs_path) return;
        const filePath = `${g.facePath}${json_configs_path || skin_path}/${fileName}`;
        return fetch(filePath)
            .then((r) => r.json())
            .catch(() => ({}));
    }

    function buildMarketsTranslation(data) {
        let marketTranslation = {};
        for (let marketId in data) {
            if (data.hasOwnProperty(marketId)) {
                let market = data[marketId];
                marketTranslation[marketId] = {
                    shortName: market[0],
                    longName: market[1],
                    description: market[2],
                };
                marketStore[marketId] = {
                    ...marketStore[marketId],
                    ...marketTranslation[marketId],
                };
            }
        }
        return {
            marketTranslation,
        };
    }

    function clearNotInViewOdds() {
        setTimeout(() => {
            for (let matchId in oddsStore) {
                if (!storeInView["center"].matches[matchId] && !storeInView["center-live"].matches[matchId]) {
                    delete oddsStore[matchId];
                    delete oddsFeed[matchId];
                }
            }
        }, 1);
    }

    function getEventsKeys(matchInView, marketsInView) {
        const keys = [];
        const maps = {};
        if (matchInView.length > 0) {
            matchInView.forEach((id) => {
                const {
                    map
                } = matchStore[id];
                for (const [sourceId, mapData] of Object.entries(map).sort((a, b) => a[1].p - b[1].p)) {
                    const {
                        mf
                    } = mapData;
                    if (mf && !marketFilterStore[mf]) continue;
                    const ml = marketFilterStore[mf] ? .markets || [];
                    if (!mf || !marketsInView || marketsInView.some((m) => ml.includes(m))) {
                        keys.push(sourceId);
                        maps[sourceId] = id;
                    }
                }
            });
        }
        return {
            keys,
            maps
        };
    }

    async function getMarketsOdds(toSubscribe, marketsInView, toSubscribeLive, marketsInViewLive, callback) {
        clearNotInViewOdds();

        const matchInView = Object.keys(toSubscribe.matches);
        const matchInViewLive = Object.keys(toSubscribeLive.matches);

        let ga = [];
        let gac = {};
        let gac_p = {};
        let gac_l = {};
        let gfl = {
            e: [],
            f: []
        };

        const {
            keys: prematchKeys,
            maps: prematchMaps
        } = getEventsKeys(matchInView, marketsInView);
        const {
            keys: liveKeys,
            maps: liveMaps
        } = getEventsKeys(matchInViewLive, marketsInViewLive);

        let temp_gac = [];
        const {
            shard
        } = g.domainConfigs;
        for (let level in sportModel) {
            if (+sportModel[level] === -1) continue;
            gac[level] = [];
            gac_p[level] = [];
            gac_l[level] = [];
            if (+sportModel[level] === 0) {
                matchInViewLive.forEach((id) => {
                    gac_l[level].push(`${shard}_sts${sportModel[level]}_${id.substring(1)}`);
                });
                temp_gac.push(...gac[level], ...gac_p[level], ...gac_l[level]);
                continue;
            }
            toSubscribe.sports.forEach((id) => {
                gac[level].push(`${shard}_cs${sportModel[level]}_${id}`);
            });
            toSubscribe.categs.forEach((id) => {
                gac[level].push(`${shard}_cc${sportModel[level]}_${id}`);
            });
            toSubscribe.tours.forEach((id) => {
                gac[level].push(`${shard}_ct${sportModel[level]}_${id}`);
            });
            toSubscribe.groups.forEach((id) => {
                gac[level].push(`${shard}_cg${sportModel[level]}_${id}`);
            });
            matchInView.forEach((id) => {
                gac_p[level].push(`${shard}_cp${sportModel[level]}_${id.substring(1)}`);
            });

            toSubscribeLive.sports.forEach((id) => {
                gac[level].push(`${shard}_cs${sportModel[level]}_${id}`);
            });
            toSubscribeLive.categs.forEach((id) => {
                gac[level].push(`${shard}_cc${sportModel[level]}_${id}`);
            });
            toSubscribeLive.tours.forEach((id) => {
                gac[level].push(`${shard}_ct${sportModel[level]}_${id}`);
            });
            toSubscribeLive.groups.forEach((id) => {
                gac[level].push(`${shard}_cg${sportModel[level]}_${id}`);
            });
            matchInViewLive.forEach((id) => {
                gac_l[level].push(`${shard}_cl${sportModel[level]}_${id.substring(1)}`);
            });
            temp_gac.push(...gac[level], ...gac_p[level], ...gac_l[level]);
        }
        let dataToSend = [];
        if (prematchKeys.length > 0) {
            dataToSend.push(["gf", prematchKeys, marketsInView]);
        }
        if (liveKeys.length > 0) {
            dataToSend.push(["gf", liveKeys, marketsInViewLive]);
        }
        if (gfl.e.length > 0) {
            dataToSend.push(["go", gfl.e.map((id) => id.substring(1)), gfl.f, shard, sportSelectedId, 1]);
        }
        // dataToSend.push(['ga', [...ga, ...gac, ...gac_p, ...gac_l]]);
        dataToSend.push(["ga", [...ga, ...temp_gac]]);

        const data = await g.platformApiCall("", "json", dataToSend, "nrdst", "json", 0);
        let i = 0;
        if (prematchKeys.length > 0) {
            prematchKeys.forEach((id) => {
                if (data[i][id] && data[i][id] !== "failed" && +data[i][id].state === 0) {
                    const matchId = prematchMaps[id];
                    oddsFeed[matchId] = oddsFeed[matchId] || {};
                    for (let marketId in data[i][id]) {
                        if (!oddsFeed[matchId][marketId]) {
                            oddsFeed[matchId][marketId] = data[i][id][marketId];
                            if (marketStore[marketId] && oddsFeed[matchId][marketId]) {
                                oddsFeed[matchId][marketId].sidp = id;
                            }
                        }
                    }
                }
                i++;
            });
        }

        if (liveKeys.length > 0) {
            liveKeys.forEach((id) => {
                if (data[i][id] && data[i][id] !== "failed" && +data[i][id].state === 0) {
                    const matchId = liveMaps[id];
                    oddsFeed[matchId] = oddsFeed[matchId] || {};
                    for (let marketId in data[i][id]) {
                        if (!oddsFeed[matchId][marketId]) {
                            oddsFeed[matchId][marketId] = data[i][id][marketId];
                            if (marketStore[marketId] && oddsFeed[matchId][marketId]) {
                                oddsFeed[matchId][marketId].sidp = id;
                            }
                        }
                    }
                }
                i++;
            });
        }
        for (let level in sportModel) {
            if (+sportModel[level] !== -1) {
                gac[level].forEach((c) => {
                    if (data[i][c] && data[i][c] !== "failed") {
                        const _c = c.split("_");
                        const type = _c[1].substring(0, 2);
                        const eventId = _c[2];
                        rawSportConfigStore[level][type][eventId] = data[i][c];
                    }
                    i++;
                });
                gac_p[level].forEach((c) => {
                    if (data[i][c] && data[i][c] !== "failed") {
                        const _c = c.split("_");
                        const type = _c[1].substring(0, 2);
                        const eventId = `p${_c[2]}`;
                        rawSportConfigStore[level][type][eventId] = data[i][c];
                    }
                    i++;
                });
                gac_l[level].forEach((c) => {
                    if (data[i][c] && data[i][c] !== "failed") {
                        const _c = c.split("_");
                        let type = _c[1].substring(0, 2);
                        if (c.includes("clr") || c.includes("sts")) {
                            type = _c[1].substring(0, 3);
                        }
                        const eventId = `l${_c[2]}`;
                        rawSportConfigStore[level][type][eventId] = data[i][c];
                    }
                    i++;
                });
            }
        }
        buildSportConfigStore();
        matchInView.forEach((matchId) => {
            if (oddsFeed[matchId]) {
                oddsStore[matchId] = {};
                buildMatchOdds(oddsFeed[matchId], oddsStore[matchId], matchId);
            }
        });
        matchInViewLive.forEach((matchId) => {
            if (oddsFeed[matchId]) {
                oddsStore[matchId] = {};
                buildMatchOdds(oddsFeed[matchId], oddsStore[matchId], matchId);
            }
        });
        if (callback) {
            callback();
        }
    }

    async function getExtraMarketsOdds(toSubscribe, matchId, cloneId, callback) {
        extraOddsFeed = {};
        extraOddsStore = {};
        let gac = {};
        let temp_gac = [];
        const {
            shard
        } = g.domainConfigs;
        for (let level in sportModel) {
            if (+sportModel[level] !== -1) {
                gac[level] = [];
                toSubscribe.sports.forEach((id) => {
                    gac[level].push(`${shard}_cs${sportModel[level]}_${id}`);
                });
                toSubscribe.categs.forEach((id) => {
                    gac[level].push(`${shard}_cc${sportModel[level]}_${id}`);
                });
                toSubscribe.tours.forEach((id) => {
                    gac[level].push(`${shard}_ct${sportModel[level]}_${id}`);
                });
                toSubscribe.groups.forEach((id) => {
                    gac[level].push(`${shard}_cg${sportModel[level]}_${id}`);
                });
                if (matchId[0] === "l") {
                    gac[level].push(`${shard}_cl${sportModel[level]}_${matchId.substring(1)}`);
                    gac[level].push(`${shard}_clr${sportModel[level]}_${matchId.substring(1)}`);
                    gac[level].push(`${shard}_sts${sportModel[level]}_${matchId.substring(1)}`);
                } else {
                    gac[level].push(`${shard}_cp${sportModel[level]}_${matchId.substring(1)}`);
                }

                temp_gac.push(...gac[level]);
            }
        }

        const allMatchMaps = [];
        const {
            map = {}
        } = matchStore[matchId];
        // for (const sourceId of sid) {
        //   gaSourceMap.push(sourceId);
        //   allMatchMaps.push(sourceId);
        // }

        let dataToSend = [];

        for (const [sourceId, mapData] of Object.entries(map).sort((a, b) => a[1].p - b[1].p)) {
            const {
                mf
            } = mapData;
            if (mf && !marketFilterStore[mf]) continue;
            const ml = marketFilterStore[mf] ? .markets || [];
            if (!mf) {
                dataToSend.push(["ga", [sourceId]]);
                allMatchMaps.push(sourceId);
            } else {
                dataToSend.push(["gf", [sourceId],
                    [...ml, "state"]
                ]);
                allMatchMaps.push(sourceId);
            }
        }

        dataToSend.push(["ga", temp_gac]);

        const data = await g.platformApiCall("", "json", dataToSend, "nrdst", "json", 0);
        let i = 0;
        allMatchMaps.forEach((id) => {
            if (data[i][id] && data[i][id] !== "failed" && +data[i][id].state === 0) {
                for (let marketId in data[i][id]) {
                    if (!extraOddsFeed[marketId]) {
                        extraOddsFeed[marketId] = data[i][id][marketId];
                        if (marketStore[marketId] && extraOddsFeed[marketId]) {
                            extraOddsFeed[marketId].sidp = id;
                        }
                    }
                }
            }
            i++;
        });
        for (let level in sportModel) {
            if (+sportModel[level] !== -1) {
                gac[level].forEach((c) => {
                    if (data[i][c] && data[i][c] !== "failed") {
                        const _c = c.split("_");
                        let type = _c[1].substring(0, 2);
                        let eventId = _c[2];
                        if (["cp", "cl"].includes(type)) {
                            eventId = matchId;
                        }
                        if (c.includes("clr") || c.includes("sts")) {
                            type = _c[1].substring(0, 3);
                            eventId = matchId;
                        }
                        rawSportConfigStore[level][type][eventId] = data[i][c];
                    }
                    i++;
                });
            }
        }
        buildSportConfigStore();
        // extraOddsStore = {};
        buildMatchOdds(extraOddsFeed, extraOddsStore, matchId);

        if (callback) {
            callback();
        }
    }

    function applyCfb_mo(marketS, market, useProb, cfb_mo) {
        if (!marketS.outcomeAllIds || marketS.outcomeAllIds.length < 2) {
            return false;
        }
        let minO = Object.keys(market)[0];
        for (const oId in marketS.outcomeById) {
            if (!market[oId]) {
                return false;
            }
            if (Array.isArray(market[oId])) {
                if (useProb) {
                    if (market[oId][2] * 1 > market[minO][2] * 1) {
                        minO = oId;
                    }
                } else {
                    if (market[oId][0] * 1 < market[minO][0] * 1) {
                        minO = oId;
                    }
                }
            } else {
                if (market[oId] * 1 < market[oId][minO] * 1) {
                    minO = oId;
                }
            }
        }
        if (Array.isArray(market[minO])) {
            market[minO][0] *= cfb_mo;
            market[minO][2] /= cfb_mo;
        } else {
            market[minO] *= cfb_mo;
        }
        return true;
    }

    function buildMatchOdds(input, outputStore, matchId) {
        if (input && input._error) {
            outputStore = {};
            return;
        }
        const inputStore = JSON.parse(JSON.stringify(input || {}));
        const {
            sportId,
            categId,
            tourId,
            groupId,
            live
        } = matchStore[matchId];
        for (const marketId in inputStore) {
            if (inputStore.hasOwnProperty(marketId)) {
                if (inputStore[marketId] !== null) {
                    if (marketStore[marketId] && marketStore[marketId].outcomeAllIds) {
                        const allMarketsConfig = calculateAllMarketConfig(sportId, categId, tourId, groupId, matchId, live);
                        const marketConfig = { ...allMarketsConfig,
                            ...calculateMarketConfig(sportId, categId, tourId, groupId, matchId, marketId, live)
                        };
                        if (marketConfig.s !== 1) {
                            for (let sbv in inputStore[marketId]) {
                                if (sbv === "sidp") continue;
                                if (Object.keys(inputStore[marketId][sbv]).length === 0) {
                                    delete outputStore ? .[marketId] ? .[sbv];
                                    if (Object.keys(inputStore[marketId]).length === 0) {
                                        delete outputStore ? .[marketId];
                                    }
                                    continue;
                                }
                                if (inputStore[marketId].hasOwnProperty(sbv) && inputStore[marketId][sbv]) {
                                    if (!inputStore[marketId][sbv] || +marketConfig[`s_${sbv.substring(1)}`] === 1 || inputStore[marketId][sbv].s > 0) continue;
                                    if (sbv === "cloneId") {
                                        continue;
                                    }
                                    let totalProb = undefined;
                                    let useProb = false;
                                    let balance;

                                    if (marketConfig.use_prob * 1) {
                                        useProb = true;
                                    }
                                    let appliedCfb_mo = false;
                                    if (marketConfig.cfb_mo * 1) {
                                        appliedCfb_mo = applyCfb_mo(marketStore[marketId], inputStore[marketId][sbv], useProb, marketConfig.cfb_mo);
                                    }
                                    if (!appliedCfb_mo) {
                                        for (const oId in inputStore[marketId][sbv]) {
                                            if (marketConfig[`cfb_${oId}`] * 1) {
                                                if (Array.isArray(inputStore[marketId][sbv][oId])) {
                                                    inputStore[marketId][sbv][oId][0] *= marketConfig[`cfb_${oId}`];
                                                    inputStore[marketId][sbv][oId][2] /= marketConfig[`cfb_${oId}`];
                                                } else {
                                                    inputStore[marketId][sbv][oId] *= marketConfig[`cfb_${oId}`];
                                                }
                                            }
                                        }
                                    }
                                    if (marketConfig.po && marketConfig.po > 0 && marketConfig.po !== 100) {
                                        ({
                                            totalProb,
                                            useProb
                                        } = calculateTotalProb(marketStore[marketId], inputStore[marketId][sbv], useProb));
                                        if (100 / marketConfig.po > totalProb) {
                                            if (marketConfig.balance) {
                                                balance = marketConfig.balance;
                                            } else {
                                                balance = 1 / marketStore[marketId].outcomeAllIds.length;
                                            }
                                        } else {
                                            totalProb = undefined;
                                        }
                                    }
                                    marketStore[marketId].outcomeAllIds.forEach((outcomeId) => {
                                        if (+marketConfig[`s_${sbv.substring(1)}_${outcomeId}`]) return;
                                        let outcomeOdd = undefined;
                                        let outcomeOddObj = {};
                                        if (inputStore[marketId][sbv][outcomeId] && Array.isArray(inputStore[marketId][sbv][outcomeId])) {
                                            if (inputStore[marketId][sbv][outcomeId] && inputStore[marketId][sbv][outcomeId][0] !== 0 && inputStore[marketId][sbv][outcomeId][0] !== null) {
                                                outcomeOdd = inputStore[marketId][sbv][outcomeId][0] / 100;
                                                if (useProb) {
                                                    outcomeOdd = inputStore[marketId][sbv][outcomeId][2] / 10000;
                                                }
                                                outcomeOdd = calculateOdd(outcomeOdd, marketConfig, totalProb, balance, outcomeId, useProb);
                                                outcomeOdd = outcomeOdd * 100;
                                                outcomeOddObj = {
                                                    odd: outcomeOdd,
                                                    status: inputStore[marketId][sbv][outcomeId][1],
                                                };
                                            }
                                        } else if (inputStore[marketId][sbv][outcomeId] !== 0 && inputStore[marketId][sbv][outcomeId] !== null) {
                                            outcomeOdd = inputStore[marketId][sbv][outcomeId] / 100;
                                            outcomeOdd = calculateOdd(outcomeOdd, marketConfig, totalProb, balance, outcomeId);
                                            outcomeOdd = outcomeOdd * 100;
                                            outcomeOddObj = {
                                                odd: outcomeOdd,
                                            };
                                        }
                                        if (outcomeOdd) {
                                            if (!outputStore[marketId]) {
                                                outputStore[marketId] = {};
                                            }
                                            if (!outputStore[marketId][sbv]) {
                                                outputStore[marketId][sbv] = {};
                                            }
                                            // TODO: change store update
                                            if (live && outputStore[marketId][sbv][outcomeId] && outputStore[marketId][sbv][outcomeId].odd) {
                                                if (outcomeOdd - outputStore[marketId][sbv][outcomeId].odd > 0) {
                                                    oddsChangeStore["mid" + matchId + "_m" + marketId + "_" + sbv + "_o" + outcomeId] = Date.now();
                                                } else if (outcomeOdd - outputStore[marketId][sbv][outcomeId].odd < 0) {
                                                    oddsChangeStore["mid" + matchId + "_m" + marketId + "_" + sbv + "_o" + outcomeId] = -1 * Date.now();
                                                } else {
                                                    if (Date.now() - oddsChangeStore["mid" + matchId + "_m" + marketId + "_" + sbv + "_o" + outcomeId] > 10000) {
                                                        delete oddsChangeStore["mid" + matchId + "_m" + marketId + "_" + sbv + "_o" + outcomeId];
                                                    }
                                                }
                                            }
                                            outputStore[marketId][sbv][outcomeId] = outcomeOddObj;
                                        }
                                    });
                                    // TODO: Add market/sbv state 's'
                                    // if (!outputStore[marketId]) {
                                    //   outputStore[marketId] = {};
                                    // }
                                    // if (!outputStore[marketId][sbv]) {
                                    //   outputStore[marketId][sbv] = {};
                                    // }
                                    // outputStore[marketId][sbv]['status'] = inputStore[marketId][sbv]['status'];

                                    // if (hasOdds) {
                                    //   buildOddsCalculatedStore(marketConfig, matchId, marketId, sbv, live);
                                    // } else {
                                    //   delete inputStore[marketId][sbv];
                                    //   if (outputStore && outputStore[marketId]) {
                                    //     delete outputStore[marketId][sbv];
                                    //   }
                                    // }
                                }
                            }
                            if (Object.keys(inputStore[marketId]).length === 0) {
                                delete inputStore[marketId];
                                if (outputStore) {
                                    delete outputStore[marketId];
                                }
                            } else {
                                for (let sbv_o in outputStore[marketId]) {
                                    if (!inputStore[marketId][sbv_o] || inputStore[marketId][sbv_o].s * 1) {
                                        delete outputStore[marketId][sbv_o];
                                        if (Object.keys(outputStore[marketId]).length === 0) {
                                            delete outputStore[marketId];
                                        }
                                    }
                                }
                            }
                            if (outputStore[marketId] && inputStore[marketId]["cloneId"]) {
                                outputStore[marketId]["cloneId"] = inputStore[marketId]["cloneId"];
                            }
                            if (marketStore[marketId].hasSbv && outputStore[marketId]) {
                                let mbbSbv = getMbSbv(marketStore[marketId], outputStore[marketId], live);
                                if (mbbSbv) {
                                    outputStore[marketId].mbbSbv = mbbSbv;
                                }
                            }
                        } else {
                            // delete inputStore[marketId];
                            if (outputStore) {
                                delete outputStore[marketId];
                            }
                        }
                    } else if (isNaN(marketId * 1)) {
                        if (!outputStore) {
                            outputStore = {};
                        }
                        outputStore[marketId] = inputStore[marketId];
                    }
                } else {
                    delete inputStore[marketId];
                    if (outputStore) {
                        delete outputStore[marketId];
                    }
                }
            }
        }
        if (outputStore) {
            if (outputStore.timer && !outputStore.timer.toString().includes("~")) {
                const now = new Date().getTime() / 1000;
                outputStore.timer = ((now - outputStore.timer) / 60).toFixed(0);
                outputStore.timer = `${outputStore.timer}~${outputStore._pn}`;
            }
            // score: "70:73, (15:23), (25:20), (17:18), (13:12) 04:49"
            // score: "77:70, (22:31), (38:25), (17:14), (0:0) 5:8"
            // _sc: {Q1: [9, 9], Q2: [0, 0], H1: [9, 9], Q3: [0, 0], Q4: [0, 0], T: [9, 9]}
            if (outputStore.score && +sportSelectedId === 1 && outputStore.score.includes(",")) {
                outputStore.score = outputStore.score.split(",")[0];
            }
            if (outputStore._sc && +sportSelectedId === 2) {
                try {
                    const {
                        T,
                        Q1,
                        Q2,
                        Q3,
                        Q4
                    } = input._sc;
                    const minutes = Math.floor(input.timer / 60);
                    const seconds = input.timer - minutes * 60;
                    const cron = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
                    outputStore.score = `${T.join(":")}, (${Q1.join(":")}), (${Q2.join(":")}), (${Q3.join(":")}), (${Q4.join(":")}) ${cron}`;
                } catch (e) {
                    console.log(e);
                }
            }
            for (const aId in outcomeAlias) {
                const a = outcomeAlias[aId];
                for (const oId in a.outcomes) {
                    const {
                        m,
                        s,
                        o
                    } = a.outcomes[oId];
                    if (input && input[m] && input[m][s] && input[m][s][o]) {
                        if (!input[aId]) {
                            input[aId] = {
                                s: {}
                            };
                        }
                        input[aId].s[oId] = input[m][s][o];
                    }
                    if (outputStore[m] && outputStore[m][s] && outputStore[m][s][o]) {
                        if (!outputStore[aId]) {
                            outputStore[aId] = {
                                s: {}
                            };
                        }
                        outputStore[aId].s[oId] = outputStore[m][s][o];
                    }
                }
            }
        }
        cleanMarkets(extraOddsStore, live);
    }

    function cleanMarkets(markets, live) {
        const cleaned = {};
        const closedStatuses = !live ? [1, 3] : [3];

        for (const [marketId, marketData] of Object.entries(markets)) {
            // no sbv
            if (!+marketId) {
                cleaned[marketId] = marketData;
            } else if (marketData.s) {
                const outcomes = Object.values(marketData.s);
                const allClosed = outcomes.every((o) => closedStatuses.includes(+o.status));
                if (!allClosed) {
                    cleaned[marketId] = marketData;
                }
            } else {
                // sbv
                const newMarket = { ...marketData
                };
                let hasValidSbv = false;
                for (const [sbvKey, sbvValue] of Object.entries(marketData)) {
                    if (sbvKey.startsWith("s")) {
                        const outcomes = Object.values(sbvValue);
                        const allClosed = outcomes.every((o) => closedStatuses.includes(+o.status));
                        if (allClosed) {
                            delete newMarket[sbvKey];
                        } else {
                            hasValidSbv = true;
                        }
                    }
                }
                if (hasValidSbv) {
                    cleaned[marketId] = newMarket;
                }
            }
        }
        extraOddsStore = cleaned;
    }

    function getMbSbv(market, marketOdds, live) {
        let mbbSbv = undefined;
        let minDeviation = 99999999;
        const closedStatuses = !live ? [1, 3] : [3];

        if (Object.keys(marketOdds).length === 1) {
            return Object.keys(marketOdds)[0];
        }
        for (let sbv in marketOdds) {
            if (sbv !== "mbbSbv") {
                const allClosed = market.outcomeAllIds.every((outcomeId) => closedStatuses.includes(+marketOdds[sbv][outcomeId] ? .status));
                if (allClosed) continue;
                const hasMissingOdds = market.outcomeAllIds.some((outcomeId) => !marketOdds[sbv][outcomeId] ? .odd);
                if (hasMissingOdds) continue;
                let outcomeArr = market.outcomeAllIds.map((outcomeId) => marketOdds[sbv][outcomeId].odd);
                if (outcomeArr.length > 2) {
                    let sum = 0;
                    outcomeArr.forEach((odd) => (sum += odd));
                    let mean = sum / outcomeArr.length;
                    let dev = 0;
                    outcomeArr.forEach((odd) => {
                        dev += Math.abs(odd - mean);
                    });
                    if (dev < minDeviation) {
                        minDeviation = dev;
                        mbbSbv = sbv;
                    }
                } else if (outcomeArr.length === 2) {
                    let dev = Math.abs(outcomeArr[1] - outcomeArr[0]);
                    if (dev < minDeviation) {
                        minDeviation = dev;
                        mbbSbv = sbv;
                    }
                } else {
                    if (outcomeArr[0] < minDeviation) {
                        minDeviation = outcomeArr[0];
                        mbbSbv = sbv;
                    }
                }
            }
        }
        return mbbSbv;
    }

    function calculateGlobalConfig(sportId, categId, groupId, tourId, type) {
        let marketConfig = {};
        for (const level in rawSportConfigStore) {
            if (rawSportConfigStore.hasOwnProperty(level)) {
                if (rawSportConfigStore[level]["cs"][sportId] && rawSportConfigStore[level]["cs"][sportId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cs"][sportId][type],
                    };
                }
                if (rawSportConfigStore[level]["cc"][categId] && rawSportConfigStore[level]["cc"][categId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cc"][categId][type],
                    };
                }
                if (rawSportConfigStore[level]["cg"][groupId] && rawSportConfigStore[level]["cg"][groupId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cg"][groupId][type],
                    };
                }
                if (rawSportConfigStore[level]["ct"][tourId] && rawSportConfigStore[level]["ct"][tourId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["ct"][tourId][type],
                    };
                }
            }
        }
        return marketConfig;
    }

    function calculateAllMarketConfig(sportId, categId, tourId, groupId, matchId, live) {
        const type = +live ? -2 : -1;
        const eType = +live ? "cl" : "cp";
        let marketConfig = {};
        for (const level in rawSportConfigStore) {
            if (rawSportConfigStore.hasOwnProperty(level)) {
                if (rawSportConfigStore[level]["cs"][sportId] && rawSportConfigStore[level]["cs"][sportId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cs"][sportId][type],
                    };
                }
                if (rawSportConfigStore[level]["cc"][categId] && rawSportConfigStore[level]["cc"][categId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cc"][categId][type],
                    };
                }
                if (rawSportConfigStore[level]["cg"][groupId] && rawSportConfigStore[level]["cg"][groupId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cg"][groupId][type],
                    };
                }
                if (rawSportConfigStore[level]["ct"][tourId] && rawSportConfigStore[level]["ct"][tourId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["ct"][tourId][type],
                    };
                }
                if (rawSportConfigStore[level][eType][matchId] && rawSportConfigStore[level][eType][matchId][type]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level][eType][matchId][type],
                    };
                }
            }
        }
        return marketConfig;
    }

    function calculateMarketConfig(sportId, categId, tourId, groupId, matchId, marketId, live) {
        const eType = +live ? "cl" : "cp";
        marketId = `${+live ? "l" : "p"}${marketId}`;
        let marketConfig = {};
        for (const level in rawSportConfigStore) {
            if (rawSportConfigStore.hasOwnProperty(level)) {
                if (rawSportConfigStore[level]["cs"][sportId] && rawSportConfigStore[level]["cs"][sportId][marketId]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cs"][sportId][marketId],
                    };
                }
                if (rawSportConfigStore[level]["cc"][categId] && rawSportConfigStore[level]["cc"][categId][marketId]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cc"][categId][marketId],
                    };
                }
                if (rawSportConfigStore[level]["cg"][groupId] && rawSportConfigStore[level]["cg"][groupId][marketId]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["cg"][groupId][marketId],
                    };
                }
                if (rawSportConfigStore[level]["ct"][tourId] && rawSportConfigStore[level]["ct"][tourId][marketId]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level]["ct"][tourId][marketId],
                    };
                }
                if (rawSportConfigStore[level][eType][matchId] && rawSportConfigStore[level][eType][matchId][marketId]) {
                    marketConfig = {
                        ...marketConfig,
                        ...rawSportConfigStore[level][eType][matchId][marketId],
                    };
                }
                if (rawSportConfigStore[level]["sts"][matchId]) {
                    const sts = rawSportConfigStore[level]["sts"][matchId];
                    for (const k in sts) {
                        if (sts[k] === null || !sts[k]) continue;
                        if (+k === -2) {
                            marketConfig.s = 1;
                            continue;
                        }
                        const [mid, sid, oid] = k.split("_");
                        if (marketId !== mid) continue;
                        if (oid) {
                            marketConfig[`s_${sid}_${oid}`] = 1;
                            continue;
                        }
                        if (sid) {
                            marketConfig[`s_${sid}`] = 1;
                            continue;
                        }
                        marketConfig.s = 1;
                    }
                }
                if (rawSportConfigStore[level]["clr"] ? .[matchId]) {
                    const clr = rawSportConfigStore[level]["clr"][matchId];
                    for (const k in clr) {
                        if (clr[k] === null) continue;
                        const [mid, sid, oid] = k.split("_");
                        if (marketId !== mid) continue;
                        if (oid) {
                            marketConfig[`s_${sid}_${oid}`] = 1;
                            continue;
                        }
                        if (sid) {
                            marketConfig[`s_${sid}`] = 1;
                            continue;
                        }
                        marketConfig.s = 1;
                    }
                }
            }
        }
        return marketConfig;
    }

    function calculateTotalProb(market, marketOdds, useProb) {
        let totalProb = 0;
        let PtotalProb = 0;
        let hasProb = false;
        market.outcomeAllIds.forEach((outcomeId) => {
            let outcomeOdd = 1;
            let oprob = 0.0001;
            if (marketOdds && marketOdds[outcomeId]) {
                if (Array.isArray(marketOdds[outcomeId])) {
                    outcomeOdd = marketOdds[outcomeId][0] / 100;
                    if (marketOdds[outcomeId][2]) {
                        hasProb = true;
                        oprob = marketOdds[outcomeId][2] / 10000;
                    }
                } else {
                    outcomeOdd = marketOdds[outcomeId] / 100;
                }
            }
            totalProb += 1 / outcomeOdd;
            PtotalProb += oprob;
        });
        if (market.outcomeAllIds.length === 1) {
            totalProb += 1;
            PtotalProb += 0.0001;
        }
        if (hasProb && useProb) {
            return {
                totalProb: PtotalProb,
                useProb: true,
            };
        }
        return {
            totalProb: totalProb,
            useProb: false,
        };
    }

    function calculateOdd(outcomeOdd, marketConfig, totalProb, balance, outcomeId, useProb) {
        if (useProb) {
            outcomeOdd = 1 / outcomeOdd;
        }
        if (totalProb) {
            outcomeOdd = 1 / (1 / outcomeOdd + (100 / marketConfig.po - totalProb) * balance);
        }
        if (marketConfig["cf_" + outcomeId] && marketConfig["cf_" + outcomeId] > 0 && marketConfig["cf_" + outcomeId] < 2) {
            outcomeOdd *= marketConfig["cf_" + outcomeId];
        }
        let min = 1;
        if (marketConfig.min) {
            min = marketConfig.min;
        }
        if (outcomeOdd < min) {
            outcomeOdd = undefined;
        }
        if (marketConfig.max && outcomeOdd > marketConfig.max) {
            outcomeOdd = marketConfig.max;
        }
        return (outcomeOdd * 1).toFixed(2);
    }

    function updateStoreInView(widgetName, updateType, matchIds, marketIds) {
        let newInView = {
            sports: [],
            categs: [],
            groups: [],
            tours: [],
            matches: {},
        };
        if (!storeInView[widgetName]) {
            storeInView[widgetName] = {
                sports: [],
                categs: [],
                groups: [],
                tours: [],
                matches: {},
            };
        }
        let toSubscribe = {
            sports: [],
            categs: [],
            groups: [],
            tours: [],
            matches: {},
        };
        let toUnsubscribe = {
            sports: [],
            categs: [],
            groups: [],
            tours: [],
            matches: [],
        };

        switch (updateType) {
            case "replace":
                {
                    matchIds.forEach((matchId) => {
                        const {
                            sportId,
                            categId,
                            tourId,
                            groupId
                        } = matchStore[matchId];
                        if (!newInView.sports.includes(+sportId)) {
                            newInView.sports.push(+sportId);
                        }
                        if (!newInView.categs.includes(+categId)) {
                            newInView.categs.push(+categId);
                        }
                        if (!newInView.groups.includes(+groupId)) {
                            newInView.groups.push(+groupId);
                        }
                        if (!newInView.tours.includes(+tourId)) {
                            newInView.tours.push(+tourId);
                        }

                        if (!newInView.matches[matchId]) {
                            newInView.matches[matchId] = marketIds;
                        }
                    });
                    let sports = [...newInView.sports];
                    let categs = [...newInView.categs];
                    let groups = [...newInView.groups];
                    let tours = [...newInView.tours];
                    let matches = { ...newInView.matches
                    };

                    toUnsubscribe.sports = storeInView[widgetName].sports.filter((id) => {
                        let ind = sports.indexOf(id);
                        if (ind > -1) {
                            sports.splice(ind, 1);
                            return false;
                        } else {
                            return true;
                        }
                    });
                    toSubscribe.sports = sports;

                    toUnsubscribe.categs = storeInView[widgetName].categs.filter((id) => {
                        let ind = categs.indexOf(id);
                        if (ind > -1) {
                            categs.splice(ind, 1);
                            return false;
                        } else {
                            return true;
                        }
                    });
                    toSubscribe.categs = categs;

                    toUnsubscribe.groups = storeInView[widgetName].groups.filter((id) => {
                        let ind = groups.indexOf(id);
                        if (ind > -1) {
                            groups.splice(ind, 1);
                            return false;
                        } else {
                            return true;
                        }
                    });
                    toSubscribe.groups = groups;

                    toUnsubscribe.tours = storeInView[widgetName].tours.filter((id) => {
                        let ind = tours.indexOf(id);
                        if (ind > -1) {
                            tours.splice(ind, 1);
                            return false;
                        } else {
                            return true;
                        }
                    });
                    toSubscribe.tours = tours;

                    for (let id in storeInView[widgetName].matches) {
                        if (storeInView[widgetName].matches.hasOwnProperty(id)) {
                            if (matches[id]) {
                                if (g.arraysEqual(storeInView[widgetName].matches[id], matches[id])) {
                                    delete matches[id];
                                }
                            } else {
                                toUnsubscribe.matches.push(id);
                            }
                        }
                    }
                    toSubscribe.matches = matches;

                    storeInView[widgetName] = {
                        sports: newInView.sports,
                        categs: newInView.categs,
                        groups: newInView.groups,
                        tours: newInView.tours,
                        matches: newInView.matches,
                    };
                    break;
                }
            case "add":
                {
                    const isClone = !!clonesStore[matchIds[0]];
                    const {
                        sportId,
                        categId,
                        tourId,
                        groupId
                    } = matchStore[matchIds[0]];
                    if (!isClone) {
                        if (storeInView[widgetName].sports.indexOf(sportId) === -1) {
                            toSubscribe.sports.push(sportId);
                            storeInView[widgetName].sports.push(sportId);
                        }
                        if (storeInView[widgetName].categs.indexOf(categId) === -1) {
                            toSubscribe.categs.push(categId);
                            storeInView[widgetName].categs.push(categId);
                        }
                        if (storeInView[widgetName].groups.indexOf(groupId) === -1) {
                            toSubscribe.groups.push(groupId);
                            storeInView[widgetName].groups.push(groupId);
                        }
                        if (storeInView[widgetName].tours.indexOf(tourId) === -1) {
                            toSubscribe.tours.push(tourId);
                            storeInView[widgetName].tours.push(tourId);
                        }
                    }
                    if (!storeInView[widgetName].matches[matchIds[0]]) {
                        toSubscribe.matches[matchIds[0]] = marketIds;
                        storeInView[widgetName].matches[matchIds[0]] = marketIds;
                    } else {
                        toSubscribe.matches[matchIds[0]] = marketIds;
                        storeInView[widgetName].matches[matchIds[0]].push(...marketIds);
                    }
                    break;
                }
            case "remove":
                {
                    // const { sportId, categId, tourId, groupId } = matchStore[matchIds[0]];
                    // const marketId = marketIds[0];
                    // TODO: remove old from subscribes
                    delete storeInView[widgetName].matches[matchIds[0]];
                    toUnsubscribe.matches.push(matchIds[0]);
                    break;
                }
            case "clear":
                {
                    // TODO: remove old from subscribes
                    toUnsubscribe.matches = Object.keys(storeInView[widgetName].matches);
                    storeInView[widgetName].matches = [];
                    break;
                }
        }
        return {
            toSubscribe,
            toUnsubscribe
        };
    }

    function updateBetslipStore(action) {
        let totalOddsMin = 1;
        let totalOddsMax = 1;
        let col = 1;
        let disabled = false;
        betslipStore.matchAllIds.forEach((matchId) => {
            let matchIdReal = matchId;
            // check if matchId starts with c1. and remove c1. for matchIdReal
            if (typeof matchId === "string" && matchIdReal.indexOf("c") === 0) {
                matchIdReal = matchIdReal.substring(3);
            }
            let oddMin = 99999;
            let oddMax = 0;
            col *= betslipStore.matchById[matchId].betAllIds.length;
            betslipStore.matchById[matchId].betAllIds.forEach((betId) => {
                const {
                    marketId,
                    sbvId,
                    outcomeId
                } = betslipStore.matchById[matchId].betById[betId];
                if (
                    betslipOddsStore[matchIdReal] &&
                    betslipOddsStore[matchIdReal][marketId] &&
                    betslipOddsStore[matchIdReal][marketId][sbvId] &&
                    betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId] &&
                    betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].odd &&
                    !isNaN(betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].odd)
                ) {
                    if (betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].status === undefined || +betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].status === 0) {
                        let oldOdd = betslipStore.matchById[matchId].betById[betId].odd;
                        betslipStore.matchById[matchId].betById[betId].odd = betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId];
                        betslipStore.matchById[matchId].betById[betId].status = betslipOddsStore[matchIdReal][marketId][sbvId]["status"];
                        if (betslipStore.matchById[matchId].betById[betId].status !== "Active") {
                            disabled = true;
                        }
                        if (action) {
                            delete betslipStore.matchById[matchId].betById[betId].odd.change;
                        } else if (oldOdd && oldOdd.odd - betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].odd > 0) {
                            betslipStore.matchById[matchId].betById[betId].odd.change = -1;
                        }

                        let tmpOdd = betslipStore.matchById[matchId].betById[betId].odd.odd / 100;
                        if (tmpOdd > oddMax) {
                            oddMax = tmpOdd;
                        }
                        if (tmpOdd < oddMin) {
                            oddMin = tmpOdd;
                        }
                    } else {
                        betslipStore.matchById[matchId].betById[betId].odd = {
                            odd: undefined,
                        };
                        oddMin = oddMax = 0;
                        disabled = true;
                    }
                } else {
                    betslipStore.matchById[matchId].betById[betId].odd = {
                        odd: undefined,
                    };
                    oddMin = oddMax = 0;
                    disabled = true;
                }
            });
            totalOddsMin *= oddMin;
            totalOddsMax *= oddMax;
            betslipStore.matchById[matchId].state = betslipOddsStore[matchIdReal] ? betslipOddsStore[matchIdReal].state * 1 : 4;
            if (betslipStore.matchById[matchId].state !== 0) {
                disabled = true;
            }
        });
        betslipStore.disabled = disabled;
        betslipStore.totalCols = col;
        if (col > 1) {
            betslipStore.totalOddsMin = totalOddsMin;
            betslipStore.totalOddsMax = totalOddsMax;
            delete betslipStore.totalOdds;
            if (action) {
                betslipStore.totalOddsMinOrig = totalOddsMin;
                betslipStore.totalOddsMaxOrig = totalOddsMax;
                betslipStore.change_down = false;
            } else if (totalOddsMin < betslipStore.totalOddsMinOrig || totalOddsMax < betslipStore.totalOddsMaxOrig) {
                betslipStore.change_down = true;
            }
        } else {
            betslipStore.totalOdds = totalOddsMin;
            delete betslipStore.totalOddsMin;
            delete betslipStore.totalOddsMax;
            if (action) {
                betslipStore.totalOddsOrig = totalOddsMin;
                betslipStore.change_down = false;
            } else if (totalOddsMin < betslipStore.totalOddsOrig) {
                betslipStore.change_down = true;
            }
        }
        let out = {
            action: "betslip-store",
            payload: {
                betslipStore,
                ticketStore
            },
        };
        for (let i = 0; i < g.frames.length; i++) {
            g.frames[i].postMessage(out, "*");
        }
        // if (action && betslipStore.totalBets > 0) {
        //   sessionStorage.setItem('betslipStore', JSON.stringify(betslipStore));
        // }
    }

    function clearBetslip() {
        betslipStore = {
            matchAllIds: [],
            matchById: {},
            totalBets: 0,
            totalOdds: 1,
            totalOddsOrig: 1,
        };
        betslipOddsFeed = {};
        betslipOddsStore = {};
        let out = {
            action: "betslip-store",
            payload: {
                betslipStore,
                ticketStore
            },
        };
        for (let i = 0; i < g.frames.length; i++) {
            g.frames[i].postMessage(out, "*");
        }
        let {
            toUnsubscribe
        } = updateStoreInView("betslip", "clear", [], []);
        if (g.spSocket) {
            spSocket.unSubscribe("", toUnsubscribe.matches, "match");
        }
        delete sessionStorage.betslipStore;
    }

    async function getOutcomeAlias() {
        if (+g.domainConfigs.outcome_alias !== 1) return;
        const fileName = "outcome_alias.json";
        outcomeAlias = await getJsonFile(fileName);
        g.outcomeAlias = outcomeAlias;
    }

    async function getMarketCodes() {
        if (+g.domainConfigs["market_codes"] !== 1) return;
        const data = await getJsonFile("market_codes.json");
        for (const mid in data) {
            if (tempStore.marketById[mid]) {
                for (const oid in data[mid]) {
                    if (tempStore.marketById[mid].outcomeById[oid]) {
                        tempStore.marketById[mid].outcomeById[oid].code = `c${data[mid][oid]}`;
                    }
                }
            }
            if (tempStoreLive.marketById[mid]) {
                for (const oid in data[mid]) {
                    if (tempStoreLive.marketById[mid].outcomeById[oid]) {
                        tempStoreLive.marketById[mid].outcomeById[oid].code = `c${data[mid][oid]}`;
                    }
                }
            }
        }
    }

    async function getMarketTemplates() {
        if (+g.domainConfigs["market_templates"] !== 1) return;
        const data = (await getJsonFile("market_templates.json")) || {};
        marketTemplates = data;
        g.marketTemplates = data;
    }

    function getVirtualUrl({
        username,
        currency,
        loginType,
        token
    }) {
        let url = `https://srv2.${g.domain}/v2/authentication?username=${username}&curr_id=${currency}&loginType=${loginType}&domain=${g.domain}`;
        // let url = `https://srv2.front-web.net/v2/authentication?username=${username}&curr_id=${currency}&loginType=${loginType}&domain=${g.domain}`;
        if (g.domainConfigs["shard"] && g.domainConfigs["part"]) {
            url += `&ltoken=${token}`;
        } else {
            url += `&token=${token}`;
        }
        return fetch(url)
            .then((response) => response.json())
            .then((response) => {
                if (!response || !response.CallbackUrl) {
                    alert("Something went wrong1!");
                    return;
                }
                return response.CallbackUrl;
            })
            .catch((error) => {
                console.log(error);
                alert("Something went wrong!");
            });
    }

    async function handleTicketSubmitted(data) {
        g.asyncPM({
            action: "del-localStorage",
            payload: {
                param: "pendingTicket"
            }
        });
        ticketProcessing = false;
        clearBetslip();
        if (!data.ticket) {
            let out = {
                action: "betslip-store",
                payload: {
                    betslipStore,
                    ticketStore
                },
            };
            for (let i = 0; i < g.frames.length; i++) {
                g.frames[i].postMessage(out, "*");
            }
            g.new_notification({
                type: "success",
                notif_for: "betslip",
                time: 5000,
                msg1: "ticket_submitted",
                msg2: data.ticket_id,
            });
            return;
        }
        const {
            ticketHeader,
            ticketLines
        } = await g.buildTicketDetails(
            data.ticket.ticket_data,
            data.ticket_model.ticket_header,
            data.ticket.ticket_lines,
            data.ticket_model.lines_header
        );
        ticketHeader["pay_code"] = data.ticket.pay_code;
        ticketHeader["bonus_voucher"] = data.ticket.bonus_voucher;
        ticketStore.byId[data.ticket_id] = ticketHeader;
        ticketStore.allIds.unshift(data.ticket_id);
        let out = {
            action: "betslip-store",
            payload: {
                betslipStore,
                ticketStore
            },
        };
        for (let i = 0; i < g.frames.length; i++) {
            g.frames[i].postMessage(out, "*");
        }
        let notifType;
        if (+ticketHeader.state === -1 || +ticketHeader.state === -3) {
            spSocket.subscribe(`ts${ticketHeader.ticket_id}`);
        } else if (+ticketHeader.state === -2) {
            // Offered ticket
        } else if (+ticketHeader.state === 0) {
            notifType = "success";
        } else if (+ticketHeader.state === 3 || +ticketHeader.state === 4) {
            notifType = "error";
        }

        g.new_notification({
            type: notifType,
            notif_for: "betslip",
            time: 5000,
            msg1: ticketHeader.round + "." + ticketHeader.ops,
            msg2: g.userStore.ticket_states[ticketHeader.state],
            ticketId: ticketHeader.ticket_id,
            ticketHeader,
            ticketLines,
        });
    }

    g.tempStore = tempStore;
    g.tempStoreLive = tempStoreLive;
    g.matchStore = matchStore;
    g.ticketStore = ticketStore;
    g.oddsFeed = oddsFeed;
    g.sourcesStore = sourcesStore;
    g.outcomeToAlias = outcomeToAlias;
    g.sportConfigStore = sportConfigStore;

    g.addEventListener("message", async (event) => {
        switch (event.data.action) {
            case "sport-app-loaded":
                {
                    let out = {
                        action: "sport-app-init",
                        payload: {
                            userStore: g.userStore,
                            domainConfigs: g.domainConfigs,
                            facePath: "../../" + g.facePath,
                            userLang: g.userStore.userLang,
                            userTimezone: g.userStore.userTimezone,
                            mobAppV: g.mobAppV,
                            outcomeAlias,
                        },
                    };

                    if (g.domainConfigs.casinoModel) {
                        const isMobile = g.mobileAndTabletcheck();
                        const groups = await g.getCasinoGroups(g.domainConfigs.casinoModel);
                        out.payload.casinoGroups = groups.filter((group) => typeof group.mobile === "undefined" || !!group.mobile === isMobile);
                    }
                    if (g.urlParams) out.payload.urlParams = g.urlParams;
                    // if (g.userStore && g.userStore.parameters && g.userStore.parameters.shop_mode * 1 === 2) {
                    //   out.payload.facePath = g.facePath;
                    // }
                    for (let i = 0; i < g.frames.length; i++) {
                        g.frames[i].postMessage(out, "*");
                    }
                    if (g.domainConfigs["smartsupp_key"]) {
                        setTimeout(() => {
                            g.parent.postMessage({
                                    action: "load-chat-smartsupp",
                                    payload: {
                                        key: g.domainConfigs["smartsupp_key"],
                                        offset: g.domainConfigs["chat_offset"]
                                    },
                                },
                                "*"
                            );
                        }, 1);
                    }
                    if (g.domainConfigs["google_tag_key"]) {
                        setTimeout(() => {
                            g.parent.postMessage({
                                    action: "load-google-tag-manager",
                                    payload: {
                                        key: g.domainConfigs["google_tag_key"]
                                    },
                                },
                                "*"
                            );
                        }, 1);
                    }

                    try {
                        if (!g.userStore.username || g.userStore.username === "nologin") return;
                        const pending = await g.asyncPM({
                            action: "get-localStorage-async",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                        if (pending) {
                            const {
                                ticket_id_tmp,
                                betslipStore: bStore,
                                betslipOddsStore: bso,
                                betslipOddsFeed: bsof
                            } = JSON.parse(pending);
                            betslipStore = bStore;
                            betslipOddsStore = bso;
                            betslipOddsFeed = bsof;
                            let out = {
                                action: "betslip-loader",
                                payload: {
                                    type: "show"
                                },
                            };
                            for (let i = 0; i < g.frames.length; i++) {
                                g.frames[i].postMessage(out, "*");
                            }
                            await getTicketTmpStatus(ticket_id_tmp);
                        }
                    } catch (e) {
                        console.log(e);
                    }
                    break;
                }
            case "screen-app-loaded":
                {
                    const data = {
                        action: "screen-app-init",
                        payload: {
                            userStore: g.userStore,
                            domainConfigs: g.domainConfigs,
                            userLang: g.userStore.userLang,
                            facePath: "../../" + g.facePath,
                            userTimezone: g.userStore.userTimezone,
                            mobAppV: g.mobAppV,
                            outcomeAlias,
                            params: g.params,
                        },
                    };
                    for (let i = 0; i < g.frames.length; i++) {
                        g.frames[i].postMessage(data, "*");
                    }

                    break;
                }
            case "get-sport-selected":
                {
                    const {
                        sportId
                    } = event.data.payload;
                    const {
                        shard,
                        elId_prematch,
                        elId_live
                    } = g.domainConfigs;
                    if (!sportId) {
                        console.log("Error in get-sport: sportId missing!");
                        break;
                    }
                    // const { shard } = window.domainConfigs;
                    if (spSocket) {
                        if (sportSelectedId) {
                            let arrayToUnsubscribe = [`${shard}_el${sportSelectedId}`, `${shard}_ep${sportSelectedId}`];
                            if (elId_prematch && elId_live) {
                                arrayToUnsubscribe = [`${shard}${elId_live}_el${sportSelectedId}`, `${shard}${elId_prematch}_ep${sportSelectedId}`];
                            } else if (elId_prematch) {
                                arrayToUnsubscribe = [`${shard}_el${sportSelectedId}`, `${shard}${elId_prematch}_ep${sportSelectedId}`];
                            } else if (elId_live) {
                                arrayToUnsubscribe = [`${shard}${elId_live}_el${sportSelectedId}`, `${shard}_ep${sportSelectedId}`];
                            }
                            spSocket.unSubscribe("", arrayToUnsubscribe);
                        }
                        let channel = "";
                        if (elId_prematch && elId_live) {
                            channel = `${shard}${elId_live}_el${sportId};${shard}${elId_prematch}_ep${sportId}`;
                        } else if (elId_prematch) {
                            channel = `${shard}_el${sportId};${shard}${elId_prematch}_ep${sportId}`;
                        } else if (elId_live) {
                            channel = `${shard}${elId_live}_el${sportId};${shard}_ep${sportId}`;
                        } else {
                            channel = `${shard}_el${sportId};${shard}_ep${sportId}`;
                        }
                        spSocket.subscribe(channel);
                    } else {
                        elId_live ? subscriptions.push([`${shard}${elId_live}_el${sportId}`]) : subscriptions.push([`${shard}_el${sportId}`]);
                        elId_prematch ? subscriptions.push([`${shard}${elId_prematch}_ep${sportId}`]) : subscriptions.push([`${shard}_ep${sportId}`]);
                    }
                    sportSelectedId = sportId;
                    Promise.all([getSportCollection(sportId, 1), getLocalMarketGroups(), getOutcomeAlias(), getMarketTemplates()]).then(async () => {
                        if (localMarketGroups[sportId]) {
                            if (localMarketGroups[sportId].prematch) {
                                tempStore.marketGroups = localMarketGroups[sportId].prematch;
                            }
                            if (localMarketGroups[sportId].maps) {
                                tempStore.marketMaps = localMarketGroups[sportId].maps;
                            }
                        }
                        let otherMarkets = [];
                        tempStore.marketAllIds[sportId].forEach((marketId) => {
                            let add = true;
                            if (tempStore.marketGroups) {
                                tempStore.marketGroups.forEach((group) => {
                                    if (group.markets.indexOf(marketId * 1) > -1) {
                                        add = false;
                                    }
                                });
                            }
                            if (add) {
                                otherMarkets.push(marketId * 1);
                            }
                        });
                        if (otherMarkets.length > 0) {
                            tempStore.marketGroups.push({
                                name: "other",
                                markets: otherMarkets,
                            });
                        }
                        if (localMarketGroups[sportId] && localMarketGroups[sportId].live) {
                            tempStoreLive.marketGroups = localMarketGroups[sportId].live;
                        }
                        otherMarkets = [];
                        tempStoreLive.marketAllIds[sportId].forEach((marketId) => {
                            let add = true;
                            if (tempStoreLive.marketGroups) {
                                tempStoreLive.marketGroups.forEach((group) => {
                                    if (group.markets.indexOf(marketId * 1) > -1) {
                                        add = false;
                                    }
                                });
                            }
                            if (add) {
                                otherMarkets.push(marketId * 1);
                            }
                        });
                        if (otherMarkets.length > 0) {
                            tempStoreLive.marketGroups.push({
                                name: "other",
                                markets: otherMarkets,
                            });
                        }

                        // proccess outcome aliases
                        for (const aId in outcomeAlias) {
                            const alias = outcomeAlias[aId];
                            const market = {
                                hasSbv: false,
                                name: alias.name,
                                position: alias.position,
                                isAlias: true,
                            };
                            const outcomeAllIds = [];
                            const outcomeById = {};

                            for (const oId in alias.outcomes) {
                                const outcome = alias.outcomes[oId];
                                outcomeAllIds.push(oId);
                                outcomeById[oId] = {
                                    position: outcome.p,
                                    name: outcome.n,
                                    mId: outcome.m,
                                    sId: outcome.s,
                                    oId: outcome.o,
                                    code: outcome.c || "c",
                                };
                                if (!outcomeToAlias[outcome.m]) {
                                    outcomeToAlias[outcome.m] = {};
                                }
                                if (!outcomeToAlias[outcome.m][outcome.s]) {
                                    outcomeToAlias[outcome.m][outcome.s] = {};
                                }
                                if (!outcomeToAlias[outcome.m][outcome.s][outcome.o]) {
                                    outcomeToAlias[outcome.m][outcome.s][outcome.o] = {
                                        aName: alias.name,
                                        aoName: outcome.n,
                                        aId,
                                        oId,
                                    };
                                }
                            }
                            market.outcomeAllIds = outcomeAllIds.sort((a, b) => outcomeById[a].position - outcomeById[b].position);
                            market.outcomeById = outcomeById;

                            tempStore.marketById[aId] = market;
                            tempStore.marketAllIds[sportSelectedId] = [...tempStore.marketAllIds[sportSelectedId], aId].sort(
                                (a, b) => tempStore.marketById[a].position - tempStore.marketById[b].position
                            );

                            marketStore[aId] = market;
                        }

                        //add market template
                        for (const tId in marketTemplates) {
                            const temp = marketTemplates[tId];
                            temp["mids"].forEach((mId) => {
                                if (tempStore.marketById[mId]) {
                                    tempStore.marketById[mId]["template"] = tId;
                                    if (tId === "hnd") {
                                        tempStore.marketById[mId].outcomeById[tempStore.marketById[mId].outcomeAllIds[0]].name =
                                            tempStore.marketById[mId].outcomeById[tempStore.marketById[mId].outcomeAllIds[0]].name + " ({$sbv})";
                                        tempStore.marketById[mId].outcomeById[tempStore.marketById[mId].outcomeAllIds[1]].name =
                                            tempStore.marketById[mId].outcomeById[tempStore.marketById[mId].outcomeAllIds[1]].name + " ({$-sbv})";
                                    }
                                }
                                if (tempStoreLive.marketById[mId]) {
                                    tempStoreLive.marketById[mId]["template"] = tId;
                                    if (tId === "hnd") {
                                        tempStoreLive.marketById[mId].outcomeById[tempStoreLive.marketById[mId].outcomeAllIds[0]].name =
                                            tempStoreLive.marketById[mId].outcomeById[tempStoreLive.marketById[mId].outcomeAllIds[0]].name + " ({$sbv})";
                                        tempStoreLive.marketById[mId].outcomeById[tempStoreLive.marketById[mId].outcomeAllIds[1]].name =
                                            tempStoreLive.marketById[mId].outcomeById[tempStoreLive.marketById[mId].outcomeAllIds[1]].name + " ({$-sbv})";
                                    }
                                }
                                if (marketStore[mId]) {
                                    marketStore[mId]["template"] = tId;
                                }
                            });
                        }

                        // get market codes
                        if (g.domainConfigs["skin_path"] && +g.domainConfigs["market_codes"]) {
                            await getMarketCodes();
                        }

                        let out = {
                            action: "sport-selected-update",
                            payload: {
                                store: tempStore,
                                storeLive: tempStoreLive,
                                marketsList,
                            },
                        };

                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }
                    });
                    break;
                }
            case "center-get-odds":
                {
                    let {
                        matchInView,
                        marketsInView,
                        matchInViewLive,
                        marketsInViewLive
                    } = event.data.payload;
                    marketsInView = marketsInView.filter((id) => !!marketStore[id]);
                    marketsInViewLive = marketsInViewLive.filter((id) => !!marketStore[id]);
                    marketsInView.push("state");

                    let marketsInViewSrc = marketsInView.map((id) => {
                        if (tempStore.marketMaps && tempStore.marketMaps[id]) {
                            return tempStore.marketMaps[id];
                        } else {
                            return id;
                        }
                    });
                    marketsInViewSrc.forEach((mId, i) => {
                        if (outcomeAlias[mId]) {
                            marketsInViewSrc.splice(i, 1);
                            for (const oId in outcomeAlias[mId].outcomes) {
                                if (!marketsInViewSrc.includes(outcomeAlias[mId].outcomes[oId].m)) {
                                    marketsInViewSrc.push(outcomeAlias[mId].outcomes[oId].m);
                                }
                            }
                        }
                    });
                    marketsInViewLive.push("score", "timer", "state", "redc", "yelc", "corner", "_pn", "_error", "_sc");

                    let {
                        toSubscribe,
                        toUnsubscribe
                    } = updateStoreInView("center", "replace", matchInView, marketsInViewSrc);
                    let tempInView = updateStoreInView("center-live", "replace", matchInViewLive, marketsInViewLive);
                    let toSubscribeLive = tempInView.toSubscribe;
                    let toUnsubscribeLive = tempInView.toUnsubscribe;
                    if (spSocket) {
                        const {
                            keys
                        } = getEventsKeys([...toUnsubscribe.matches, ...toUnsubscribeLive.matches]);
                        if (keys.length > 0) spSocket.unSubscribe("", keys);

                        const mtoSubscribe = {};
                        const {
                            keys: prematchKeys,
                            maps: prematchMaps
                        } = getEventsKeys(Object.keys(toSubscribe.matches), marketsInView);
                        const {
                            keys: liveKeys,
                            maps: liveMaps
                        } = getEventsKeys(Object.keys(toSubscribeLive.matches), marketsInViewLive);
                        for (const id of prematchKeys) {
                            mtoSubscribe[id] = marketsInView;
                        }
                        for (const id of liveKeys) {
                            mtoSubscribe[id] = marketsInViewLive;
                        }
                        if (Object.keys(mtoSubscribe).length > 0) spSocket.subscribe("", mtoSubscribe, { ...prematchMaps,
                            ...liveMaps
                        });
                    }

                    if (Object.keys(toSubscribe.matches).length > 0 || Object.keys(toSubscribeLive.matches).length) {
                        await getMarketsOdds(toSubscribe, marketsInView, toSubscribeLive, marketsInViewLive);
                        let out = {
                            action: "center-match-odds",
                            payload: {
                                oddsStore,
                                oddsChangeStore,
                            },
                        };
                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }
                    }
                    updateBetslipStore();
                    break;
                }
            case "extra-get-odds":
                {
                    const {
                        matchId,
                        live
                    } = event.data.payload;
                    extraMatchOpened = matchId;
                    let matchInView = [];
                    let matchInViewLive = [];
                    let cloneId;
                    if (matchStore[matchId].cloneId) {
                        cloneId = matchStore[matchId].cloneId;
                    }
                    if (live) {
                        matchInViewLive = [matchId];
                        if (cloneId) {
                            matchInViewLive.push(cloneId);
                        }
                    } else {
                        matchInView = [matchId];
                        if (cloneId) {
                            matchInView.push(cloneId);
                        }
                    }
                    let {
                        toSubscribe,
                        toUnsubscribe
                    } = updateStoreInView("center", "replace", matchInView, ["a"]);
                    let tempInView = updateStoreInView("center-live", "replace", matchInViewLive, ["a"]);
                    let toSubscribeLive = tempInView.toSubscribe;
                    let toUnsubscribeLive = tempInView.toUnsubscribe;

                    if (spSocket) {
                        const {
                            keys
                        } = getEventsKeys([...toUnsubscribe.matches, ...toUnsubscribeLive.matches]);
                        spSocket.unSubscribe("", keys);

                        const mtoSubscribe = {};
                        const {
                            keys: prematchKeys,
                            maps: prematchMaps
                        } = getEventsKeys(Object.keys(toSubscribe.matches));
                        const {
                            keys: liveKeys,
                            maps: liveMaps
                        } = getEventsKeys(Object.keys(toSubscribeLive.matches));
                        for (const id of prematchKeys) {
                            mtoSubscribe[id] = ["a"];
                        }
                        for (const id of liveKeys) {
                            mtoSubscribe[id] = ["a"];
                        }
                        spSocket.subscribe("", mtoSubscribe, { ...prematchMaps,
                            ...liveMaps
                        });
                    }

                    let toSubs = live ? toSubscribeLive : toSubscribe;
                    await getExtraMarketsOdds(toSubs, matchId, cloneId);
                    let out = {
                        action: "extra-match-odds",
                        payload: {
                            extraOddsStore,
                            oddsChangeStore,
                        },
                    };
                    for (let i = 0; i < g.frames.length; i++) {
                        g.frames[i].postMessage(out, "*");
                    }
                    break;
                }
            case "close-extra-match":
                {
                    extraOddsFeed = {};
                    extraOddsStore = {};
                    extraMatchOpened = undefined;
                    break;
                }
            case "add-to-betslip":
                {
                    if (ticketProcessing) return;
                    let {
                        matchId,
                        marketId,
                        sbvId,
                        outcomeId,
                        outcome
                    } = event.data.payload;
                    const betId = "m" + marketId + "_" + sbvId + "_o" + outcomeId;
                    let parlay = marketStore[marketId] ? marketStore[marketId].parlay : undefined;
                    let matchIdReal = matchId;
                    if (typeof matchId === "string" && matchId.startsWith(`c`)) {
                        matchIdReal = matchId.substring(3);
                    } else if (parlay) {
                        if (parlay === 3) parlay = parlay + betslipStore.matchAllIds.length;
                        matchId = `c${parlay}.` + matchId;
                    }
                    if (!betslipStore.matchById[matchId]) {
                        betslipStore.matchById[matchId] = {
                            home: matchStore[matchIdReal].home,
                            away: matchStore[matchIdReal].away,
                            code: matchStore[matchIdReal].code,
                            live: matchStore[matchIdReal].live,
                            betAllIds: [],
                            betById: {},
                        };
                        betslipStore.matchAllIds.push(matchId);
                    }
                    if (!betslipStore.matchById[matchId].betById[betId]) {
                        if (!matchStore[matchIdReal]) {
                            return;
                        }
                        if (!marketStore[marketId] || !marketStore[marketId].outcomeById[outcomeId]) {
                            return;
                        }
                        let marketResult;
                        let _store = oddsStore[matchIdReal] || {};
                        if (extraMatchOpened === matchIdReal) _store = extraOddsStore || {};
                        if (marketStore[marketId].type === "corner") {
                            marketResult = _store.corner;
                        } else if (marketStore[marketId].type === "cards") {
                            if (_store.yelc && _store.redc) marketResult = `${_store.yelc} ${_store.redc}`;
                        } else {
                            marketResult = _store.score;
                        }
                        betslipStore.matchById[matchId] = {
                            ...betslipStore.matchById[matchId],
                            betAllIds: [...betslipStore.matchById[matchId].betAllIds, betId],
                            betById: {
                                ...betslipStore.matchById[matchId].betById,
                                [betId]: {
                                    marketId,
                                    marketName: marketStore[marketId].shortName ? marketStore[marketId].shortName : marketStore[marketId].name,
                                    marketResult,
                                    sbvId,
                                    outcomeId,
                                    outcomeName: marketStore[marketId].outcomeById[outcomeId].name,
                                    odd: outcome,
                                },
                            },
                        };
                        if (g.domainConfigs.betslip_market_longname * 1 && marketStore[marketId].longName) {
                            betslipStore.matchById[matchId].betById[betId].marketName = marketStore[marketId].longName;
                        }
                        if (betslipStore.matchById[matchId].away.includes("^^") && betslipStore.matchById[matchId].away.split("^^")[2]) {
                            let i = 0;
                            if (outcomeId * 1 === 2002) {
                                i = 1;
                            }
                            if (outcomeId * 1 === 2003) {
                                i = 2;
                            }
                            betslipStore.matchById[matchId].betById[betId].marketName = betslipStore.matchById[matchId].away.split("^^")[2].split(";")[i];
                            betslipStore.matchById[matchId].betById[betId].outcomeName = "";
                        }
                        if (outcomeAlias[marketId] && outcomeAlias[marketId].outcomes[outcomeId]) {
                            const a = outcomeAlias[marketId].outcomes[outcomeId];
                            const realMarketId = a.m;
                            if (extraMatchOpened && extraOddsFeed[realMarketId] && extraOddsFeed[realMarketId].sidp) {
                                betslipStore.matchById[matchId].betById[betId].sidp = extraOddsFeed[realMarketId].sidp;
                            } else if (oddsFeed[matchIdReal] && oddsFeed[matchIdReal][realMarketId] && oddsFeed[matchIdReal][realMarketId].sidp) {
                                betslipStore.matchById[matchId].betById[betId].sidp = oddsFeed[matchIdReal][realMarketId].sidp;
                            }
                        }
                        betslipStore.totalBets++;
                        if (!betslipOddsFeed[matchIdReal]) {
                            betslipOddsFeed[matchIdReal] = {};
                        }
                        if (!betslipOddsStore[matchIdReal]) {
                            betslipOddsStore[matchIdReal] = {};
                        }
                        if (extraMatchOpened && extraOddsFeed[marketId]) {
                            betslipOddsFeed[matchIdReal][marketId] = JSON.parse(JSON.stringify(extraOddsFeed[marketId]));
                            betslipOddsStore[matchIdReal][marketId] = JSON.parse(JSON.stringify(extraOddsStore[marketId]));
                        } else if (oddsFeed[matchIdReal] && oddsFeed[matchIdReal][marketId]) {
                            betslipOddsFeed[matchIdReal][marketId] = JSON.parse(JSON.stringify(oddsFeed[matchIdReal][marketId]));
                            betslipOddsStore[matchIdReal][marketId] = JSON.parse(JSON.stringify(oddsStore[matchIdReal][marketId]));
                        }
                        betslipOddsFeed[matchIdReal].state = 0;
                        betslipOddsStore[matchIdReal].state = 0;
                        updateBetslipStore(1);

                        let resultType = ["score"];
                        if (marketStore[marketId].type === "corner") resultType = ["corner"];
                        if (marketStore[marketId].type === "cards") resultType = ["yelc", "redc"];
                        let {
                            toSubscribe
                        } = updateStoreInView("betslip", "add", [matchIdReal], [marketId, ...resultType]);
                        if (spSocket) {
                            const {
                                keys,
                                maps
                            } = getEventsKeys(Object.keys(toSubscribe.matches), [marketId]);
                            const mtoSubscribe = {};
                            for (const id of keys) {
                                mtoSubscribe[id] = [marketId];
                            }
                            spSocket.subscribe("", mtoSubscribe, maps);
                        }
                    } else {
                        try {
                            betslipStore.matchById[matchId].betAllIds = betslipStore.matchById[matchId].betAllIds.filter((id) => id !== betId);
                            delete betslipStore.matchById[matchId].betById[betId];
                            if (betslipStore.matchById[matchId].betAllIds.length === 0) {
                                delete betslipStore.matchById[matchId];
                                betslipStore.matchAllIds = betslipStore.matchAllIds.filter((id) => id !== matchId);
                                delete betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId];
                                if (Object.keys(betslipOddsStore[matchIdReal][marketId][sbvId]).length === 0) {
                                    delete betslipOddsStore[matchIdReal][marketId][sbvId];
                                    if (Object.keys(betslipOddsStore[matchIdReal][marketId]).length === 0) {
                                        delete betslipOddsStore[matchIdReal][marketId];
                                        if (Object.keys(betslipOddsStore[matchIdReal]).length === 0) {
                                            delete betslipOddsStore[matchIdReal];
                                        }
                                    }
                                }
                                delete betslipOddsFeed[matchIdReal][marketId][sbvId][outcomeId];
                                if (Object.keys(betslipOddsFeed[matchIdReal][marketId][sbvId]).length === 0) {
                                    delete betslipOddsFeed[matchIdReal][marketId][sbvId];
                                    if (Object.keys(betslipOddsFeed[matchIdReal][marketId]).length === 0) {
                                        delete betslipOddsFeed[matchIdReal][marketId];
                                        if (Object.keys(betslipOddsFeed[matchIdReal]).length === 0) {
                                            delete betslipOddsFeed[matchIdReal];
                                        }
                                    }
                                }
                                let {
                                    toUnsubscribe
                                } = updateStoreInView("betslip", "remove", [matchIdReal], [marketId]);
                                if (spSocket) {
                                    const {
                                        keys
                                    } = getEventsKeys(toUnsubscribe.matches);
                                    spSocket.unSubscribe("", keys);
                                }
                            }
                        } catch (err) {
                            // test
                        }
                        betslipStore.totalBets--;
                        updateBetslipStore(1);
                    }
                    break;
                }
            case "add-ticket-to-betslip":
                {
                    if (ticketProcessing) return;
                    event.data.payload.forEach((match) => {
                        let matchId = match.matchId;
                        let matchIdReal;
                        // check if matchId starts with c1. and remove c1. for matchIdReal
                        if (typeof matchId === "string" && matchId.indexOf("c") === 0) {
                            const parl = matchId.substring(0, 3);
                            matchIdReal = (match.live ? "l" : "p") + matchId.substring(3);
                            matchId = parl + matchIdReal;
                        } else {
                            matchId = matchIdReal = (match.live ? "l" : "p") + matchId;
                        }
                        let code = match.code;
                        let home = match.match.split("~~")[0].toString();
                        let away = match.match.split("~~")[1].toString();
                        if (!matchStore[matchIdReal]) {
                            const {
                                shard
                            } = g.domainConfigs;
                            matchStore[matchIdReal] = {
                                home,
                                away,
                                code,
                                live: match.live,
                                map: {
                                    [`s0${shard}_p${matchIdReal}`]: {
                                        p: 0
                                    }
                                },
                            };
                        }
                        for (let i = 0; i < match.outcome_id.length; i++) {
                            const marketId = match.oddstype_id[i] * 1;
                            // const marketName = match.outcome_name[i].split("~")[0];
                            const marketName = match.outcomeObj[i].marketLongName || match.outcomeObj[i].marketShortName;
                            const sbvId = match.specialbetvalue[i] ? "s" + match.specialbetvalue[i] : "s";
                            const outcomeId = match.outcome_id[i];
                            const marketResult = match.result[i];
                            let outcomeName = match.outcome_name[i].split("~")[1];
                            if (marketTemplates.hnd && (marketTemplates.hnd.mids.includes(marketId) || marketTemplates.hnd.mids.includes("" + marketId))) {
                                if (+outcomeName === 2) {
                                    outcomeName += " ({$-sbv})";
                                } else if (+outcomeName === 1) {
                                    outcomeName += " ({$sbv})";
                                }
                            }
                            const betId = "m" + marketId + "_" + sbvId + "_o" + outcomeId;
                            let outcomeOdd = {
                                odd: match.odd[i] * 100,
                            };
                            if (betslipOddsStore[matchIdReal] && betslipOddsStore[matchIdReal][marketId]) {
                                if (
                                    betslipOddsStore[matchIdReal][marketId][sbvId] &&
                                    betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId] &&
                                    betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].odd &&
                                    !isNaN(betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId].odd)
                                ) {
                                    outcomeOdd = betslipOddsStore[matchIdReal][marketId][sbvId][outcomeId];
                                } else {
                                    outcomeOdd = {
                                        odd: 0,
                                    };
                                }
                            } else {
                                betslipOddsStore[matchIdReal] = {
                                    ...betslipOddsStore[matchIdReal],
                                    [marketId]: {
                                        [sbvId]: {
                                            [outcomeId]: outcomeOdd,
                                        },
                                    },
                                    state: 0,
                                };
                            }
                            if (!betslipStore.matchById[matchId]) {
                                betslipStore.matchById[matchId] = {
                                    home,
                                    away,
                                    code,
                                    live: match.live,
                                    betAllIds: [],
                                    betById: {},
                                };
                                betslipStore.matchAllIds.push(matchId);
                            }
                            if (!betslipStore.matchById[matchId].betById[betId]) {
                                let sidp;
                                if (matchStore[matchIdReal] && matchStore[matchIdReal].map) {
                                    const mappedMatch = Object.keys(matchStore[matchIdReal].map).find((k) => +k[1] === +match.src[i]);
                                    if (mappedMatch) sidp = mappedMatch;
                                }
                                betslipStore.matchById[matchId] = {
                                    ...betslipStore.matchById[matchId],
                                    betAllIds: [...betslipStore.matchById[matchId].betAllIds, betId],
                                    betById: {
                                        ...betslipStore.matchById[matchId].betById,
                                        [betId]: {
                                            marketId,
                                            marketName,
                                            marketResult,
                                            sbvId,
                                            outcomeId,
                                            outcomeName,
                                            odd: outcomeOdd,
                                            sidp,
                                        },
                                    },
                                };
                                betslipStore.totalBets++;
                            }
                        }
                    });
                    updateBetslipStore(1);
                    break;
                }
            case "fastbet-add-to-betslip":
                {
                    if (ticketProcessing) return;
                    let {
                        matchId,
                        marketId,
                        sbvId,
                        outcomeId
                    } = event.data.payload;
                    let live = 0;
                    const betId = "m" + marketId + "_" + sbvId + "_o" + outcomeId;
                    let parlay = marketStore[marketId] ? marketStore[marketId].parlay : undefined;
                    let matchIdReal = matchId;
                    if (typeof matchId === "string" && matchId.indexOf(`c${parlay}.`) === 0) {
                        matchIdReal = matchId.substring(3);
                    } else if (parlay) {
                        if (parlay === 3) parlay = parlay + betslipStore.matchAllIds.length;
                        matchId = `c${parlay}.` + matchId;
                    }
                    if (!matchStore[matchIdReal]) {
                        if (!betslipStore.matchById[matchId]) {
                            betslipStore.matchById[matchId] = {
                                home: "match_not_found",
                                away: "",
                                code: matchId,
                                betAllIds: [],
                                betById: {},
                            };
                            betslipStore.matchAllIds.push(matchId);
                        }
                    } else {
                        live = matchStore[matchIdReal]["live"];
                    }
                    if (!betslipStore.matchById[matchId]) {
                        betslipStore.matchById[matchId] = {
                            home: matchStore[matchIdReal].home,
                            away: matchStore[matchIdReal].away,
                            code: matchStore[matchIdReal].code,
                            live: matchStore[matchIdReal].live,
                            betAllIds: [],
                            betById: {},
                        };
                        betslipStore.matchAllIds.push(matchId);
                    }
                    if (!marketStore[marketId] || !marketStore[marketId].outcomeById[outcomeId]) {
                        if (!betslipStore.matchById[matchId].betById[betId]) {
                            betslipStore.matchById[matchId] = {
                                ...betslipStore.matchById[matchId],
                                betAllIds: [...betslipStore.matchById[matchId].betAllIds, betId],
                                betById: {
                                    ...betslipStore.matchById[matchId].betById,
                                    [betId]: {
                                        marketId,
                                        marketName: "market_not_found",
                                        marketResult: "--:--",
                                        sbvId: "s",
                                        outcomeName: "",
                                        odd: {
                                            odd: undefined
                                        },
                                    },
                                },
                            };
                            betslipStore.totalBets++;
                            updateBetslipStore(1);
                        }
                        return;
                    }
                    if (!betslipStore.matchById[matchId].betById[betId]) {
                        betslipStore.matchById[matchId] = {
                            ...betslipStore.matchById[matchId],
                            betAllIds: [...betslipStore.matchById[matchId].betAllIds, betId],
                            betById: {
                                ...betslipStore.matchById[matchId].betById,
                                [betId]: {
                                    marketId,
                                    marketName: marketStore[marketId].shortName ? marketStore[marketId].shortName : marketStore[marketId].name,
                                    sbvId,
                                    outcomeId,
                                    outcomeName: marketStore[marketId].outcomeById[outcomeId].name,
                                    odd: {
                                        odd: undefined
                                    },
                                },
                            },
                        };
                        betslipStore.totalBets++;
                        updateBetslipStore(1);

                        let {
                            toSubscribe
                        } = updateStoreInView("betslip", "add", [matchIdReal], [marketId]);
                        let toSubscribeLive = {
                            sports: [],
                            categs: [],
                            groups: [],
                            tours: [],
                            matches: [],
                        };
                        let liveResults = [];
                        if (spSocket) {
                            const {
                                keys,
                                maps
                            } = getEventsKeys(Object.keys(toSubscribe.matches), [marketId]);
                            const mtoSubscribe = {};
                            for (const id of keys) {
                                mtoSubscribe[id] = [marketId];
                            }
                            spSocket.subscribe("", mtoSubscribe, maps);
                        }
                        if (live) {
                            toSubscribeLive = JSON.parse(JSON.stringify(toSubscribe));
                            toSubscribe = {
                                sports: [],
                                categs: [],
                                groups: [],
                                tours: [],
                                matches: [],
                            };
                            if (marketStore[marketId]) {
                                if (marketStore[marketId].type === "corner") {
                                    liveResults = ["corner"];
                                } else if (marketStore[marketId].type === "cards") {
                                    liveResults = ["yelc", "redc"];
                                } else {
                                    liveResults = ["score"];
                                }
                            }
                        }
                        getMarketsOdds(toSubscribe, [marketId, "state"], toSubscribeLive, [marketId, "state", ...liveResults], () => {
                            if (!betslipOddsFeed[matchIdReal]) {
                                betslipOddsFeed[matchIdReal] = {};
                            }
                            if (!betslipOddsStore[matchIdReal]) {
                                betslipOddsStore[matchIdReal] = {};
                            }
                            if (oddsFeed[matchIdReal] && oddsFeed[matchIdReal][marketId]) {
                                betslipOddsFeed[matchIdReal][marketId] = JSON.parse(JSON.stringify(oddsFeed[matchIdReal][marketId]));
                                betslipOddsStore[matchIdReal][marketId] = JSON.parse(JSON.stringify(oddsStore[matchIdReal][marketId]));
                                betslipOddsStore[matchIdReal].state = 0; // test
                            }

                            if (oddsStore[matchIdReal]) {
                                let marketResult;
                                if (marketStore[marketId].type === "corner") {
                                    marketResult = oddsStore[matchIdReal].corner;
                                } else if (marketStore[marketId].type === "cards") {
                                    marketResult = `${oddsStore[matchIdReal].yelc} ${oddsStore[matchIdReal].redc}`;
                                } else {
                                    marketResult = oddsStore[matchIdReal].score;
                                }
                                betslipStore.matchById[matchId].betById[betId].marketResult = marketResult;
                            }

                            // betslipOddsStore[matchIdReal].state = oddsStore[matchIdReal]["state"] * 1;
                            updateBetslipStore(0);
                        });
                    }
                    break;
                }
            case "clear-betslip":
                {
                    clearBetslip();
                    break;
                }
            case "submit-ticket":
                {
                    if (ticketProcessing) return;
                    // const { stake, currency, combinations, bonus_voucher } = event.data.payload;
                    const {
                        bonus_voucher,
                        ...rest
                    } = event.data.payload;
                    let submit_data = {
                        selections: [],
                        ...rest,
                    };
                    if (bonus_voucher) {
                        submit_data["bonus_voucher"] = bonus_voucher;
                        delete submit_data.stake;
                    }
                    betslipStore.matchAllIds.forEach((matchId) => {
                        let matchIdReal = matchId;
                        // check if matchId starts with c1. and remove c1. for matchIdReal
                        if (typeof matchId === "string" && matchId.indexOf("c") === 0) {
                            matchIdReal = matchId.substring(3);
                        }
                        const {
                            sportId
                        } = matchStore[matchIdReal];
                        let matchBet = [matchIdReal.substring(1), betslipStore.matchById[matchId].live, [], sportId];
                        betslipStore.matchById[matchId].betAllIds.forEach((betId) => {
                            let marketId = betslipStore.matchById[matchId].betById[betId].marketId;
                            let sbvId = betslipStore.matchById[matchId].betById[betId].sbvId;
                            let outcomeId = betslipStore.matchById[matchId].betById[betId].outcomeId;
                            if (outcomeAlias[marketId] && outcomeAlias[marketId].outcomes[outcomeId]) {
                                const a = outcomeAlias[marketId].outcomes[outcomeId];
                                marketId = a.m;
                                sbvId = a.s;
                                outcomeId = a.o;
                            }
                            // TODO: check if initialisation is needed
                            let sidp = Object.entries(matchStore[matchIdReal].map).sort((a, b) => +a[1].p - +b[1].p)[0][0];
                            if (betslipOddsFeed[matchIdReal] && betslipOddsFeed[matchIdReal][marketId] && betslipOddsFeed[matchIdReal][marketId].sidp) {
                                sidp = betslipOddsFeed[matchIdReal][marketId].sidp;
                            }
                            if (betslipStore.matchById[matchId].betById[betId].sidp) {
                                sidp = betslipStore.matchById[matchId].betById[betId].sidp;
                            }
                            // matchBet[4] = sidp;
                            let betArray = [marketId, sbvId, outcomeId, betslipStore.matchById[matchId] ? .betById[betId] ? .odd["odd"] ? .toFixed(0), 0, 0, sidp];
                            if (betslipStore.matchById[matchId].live) {
                                let marketResult;
                                let _store = oddsStore[matchIdReal] || {};
                                if (extraMatchOpened === matchIdReal) _store = extraOddsStore || {};
                                if (marketStore[marketId].type === "corner") {
                                    marketResult = _store.corner;
                                } else if (marketStore[marketId].type === "cards") {
                                    if (_store.yelc && _store.redc) marketResult = `${_store.yelc} ${_store.redc}`;
                                } else {
                                    marketResult = _store.score;
                                }
                                betArray[4] = marketResult || betslipStore.matchById[matchId].betById[betId].marketResult;
                            }
                            matchBet[2].push(betArray);
                        });
                        if (matchBet && matchBet[2].length > 0) {
                            submit_data.selections.push(matchBet);
                        }
                    });

                    const hash = await getTicketHash();
                    if (hash.error) {
                        g.new_notification({
                            type: "error",
                            notif_for: "betslip",
                            time: 5000,
                            msg1: "hash_req_error",
                            msg2: hash.id,
                        });
                        return;
                    }

                    const dataToSend = {
                        submit_data: submit_data,
                        lang: g.userStore.userLang,
                        request: hash.id,
                    };
                    if (window.location.host.includes("devel")) dataToSend.devel = 1;

                    ticketProcessing = true;
                    const ticketResponse = await g.platformApiCall(".in?action=set&subaction=insert_tickets", "json", dataToSend, "api", "json", 2);
                    if (!ticketResponse) {
                        g.new_notification({
                            type: "error",
                            notif_for: "betslip",
                            time: 5000,
                            msg1: "connection_error",
                        });
                        return;
                    }
                    if (ticketResponse.Error) {
                        ticketProcessing = false;
                        switch (ticketResponse.Message) {
                            case "odds_res_changed":
                                {
                                    if (ticketResponse.data_odds) {
                                        for (let matchId in ticketResponse.data_odds) {
                                            if (ticketResponse.data_odds.hasOwnProperty(matchId)) {
                                                let match = ticketResponse.data_odds[matchId];
                                                if (matchStore["l" + matchId]) {
                                                    matchId = "l" + matchId;
                                                } else {
                                                    matchId = "p" + matchId;
                                                }
                                                for (let marketId in match) {
                                                    if (match.hasOwnProperty(marketId)) {
                                                        for (let sbvId in match[marketId]) {
                                                            if (match[marketId].hasOwnProperty(sbvId)) {
                                                                for (const outcomeId in match[marketId][sbvId]) {
                                                                    if (match[marketId][sbvId].hasOwnProperty(outcomeId)) {
                                                                        let newOdd = match[marketId][sbvId][outcomeId];
                                                                        if (outcomeToAlias[marketId] && outcomeToAlias[marketId][sbvId] && outcomeToAlias[marketId][sbvId][outcomeId]) {
                                                                            const {
                                                                                aId,
                                                                                oId
                                                                            } = outcomeToAlias[marketId][sbvId][outcomeId];
                                                                            if (
                                                                                betslipOddsStore[matchId] &&
                                                                                betslipOddsStore[matchId][aId] &&
                                                                                betslipOddsStore[matchId][aId]["s"] &&
                                                                                betslipOddsStore[matchId][aId]["s"][oId]
                                                                            ) {
                                                                                betslipOddsStore[matchId][aId]["s"][oId].odd = newOdd;
                                                                            }
                                                                            updateBetslipStore();
                                                                        } else {
                                                                            if (
                                                                                betslipOddsStore[matchId] &&
                                                                                betslipOddsStore[matchId][marketId] &&
                                                                                betslipOddsStore[matchId][marketId][sbvId] &&
                                                                                betslipOddsStore[matchId][marketId][sbvId][outcomeId]
                                                                            ) {
                                                                                betslipOddsStore[matchId][marketId][sbvId][outcomeId].odd = newOdd;
                                                                            }
                                                                            updateBetslipStore();
                                                                        }
                                                                        try {
                                                                            if (extraMatchOpened) {
                                                                                if (extraMatchOpened === matchId || extraMatchOpened === clonesStore[matchId]) {
                                                                                    extraOddsStore[marketId][sbvId][outcomeId].odd = newOdd;
                                                                                }
                                                                            } else {
                                                                                oddsStore[matchId][marketId][sbvId][outcomeId].odd = newOdd;
                                                                                if (clonesStore[matchId]) {
                                                                                    const parentId = clonesStore[matchId];
                                                                                    oddsStore[parentId][marketId][sbvId][outcomeId].odd = newOdd;
                                                                                }
                                                                            }
                                                                        } catch (err) {
                                                                            // err
                                                                        }
                                                                        // TODO: call for match store
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (ticketResponse.data_res) {
                                        for (let matchId in ticketResponse.data_res) {
                                            if (ticketResponse.data_res.hasOwnProperty(matchId)) {
                                                let match = ticketResponse.data_res[matchId];
                                                if (matchStore["l" + matchId]) {
                                                    matchId = "l" + matchId;
                                                } else {
                                                    matchId = "p" + matchId;
                                                }
                                                let matchIdReal = matchId;
                                                for (let marketId in match) {
                                                    if (marketStore[marketId] && marketStore[marketId].parlay) {
                                                        let parlay = marketStore[marketId].parlay;
                                                        if (parlay === 3) parlay = parlay + betslipStore.matchAllIds.length;
                                                        matchId = `c${parlay}.${matchId}`;
                                                    }
                                                    const newRes = match[marketId];
                                                    if (betslipStore.matchById[matchId]) {
                                                        betslipStore.matchById[matchId].betAllIds.forEach((betId) => {
                                                            if (marketId.toString() !== betslipStore.matchById[matchId].betById[betId].marketId.toString()) return;
                                                            betslipStore.matchById[matchId].betById[betId].marketResult = newRes;
                                                            try {
                                                                let _store = oddsStore[matchIdReal] || {};
                                                                if (extraMatchOpened === matchIdReal) _store = extraOddsStore || {};
                                                                if (marketStore[marketId].type === "corner") {
                                                                    _store.corner = newRes;
                                                                } else if (marketStore[marketId].type === "cards") {
                                                                    _store.yelc = newRes.split(" ")[0];
                                                                    _store.redc = newRes.split(" ")[1];
                                                                } else {
                                                                    _store.score = newRes;
                                                                }
                                                            } catch (e) {
                                                                console.log(e.message);
                                                            }
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    g.new_notification({
                                        type: "info",
                                        notif_for: "betslip",
                                        time: 5000,
                                        msg1: ticketResponse.Message,
                                    });
                                    break;
                                }
                            default:
                                {
                                    let msg2 = "";
                                    if (ticketResponse.team) {
                                        msg2 = ticketResponse.team;
                                    }
                                    if (ticketResponse.event_id) {
                                        if (betslipStore.matchById[`l${ticketResponse.event_id}`]) {
                                            msg2 = betslipStore.matchById[`l${ticketResponse.event_id}`].home + " - " + betslipStore.matchById[`l${ticketResponse.event_id}`].away;
                                        } else if (betslipStore.matchById[`p${ticketResponse.event_id}`]) {
                                            msg2 = betslipStore.matchById[`p${ticketResponse.event_id}`].home + " - " + betslipStore.matchById[`p${ticketResponse.event_id}`].away;
                                        } else {
                                            msg2 = ticketResponse.event_id;
                                        }
                                        if (ticketResponse.market_id) {
                                            if (marketStore[ticketResponse.market_id]) {
                                                msg2 += " : " + marketStore[ticketResponse.market_id].shortName;
                                            } else {
                                                msg2 += " : " + ticketResponse.market_id;
                                            }
                                        } else if (ticketResponse.odd_id) {
                                            const [marketId, sbvId, outcomeId] = ticketResponse.odd_id.split("^");
                                            if (marketStore[marketId]) {
                                                msg2 += " : " + marketStore[marketId].shortName;
                                            } else {
                                                msg2 += " : " + marketId;
                                            }
                                            msg2 += ":" + sbvId;
                                            if (marketStore[marketId]) {
                                                if (marketStore[marketId].outcomeById[outcomeId]) {
                                                    msg2 += ":" + marketStore[marketId].outcomeById[outcomeId].name;
                                                } else {
                                                    msg2 += ":" + outcomeId;
                                                }
                                            } else {
                                                msg2 += ":" + outcomeId;
                                            }
                                        } else {
                                            if (betslipStore.matchById[`l${ticketResponse.event_id}`]) {
                                                betslipStore.matchById[`l${ticketResponse.event_id}`].state = 1;
                                                betslipOddsStore[`l${ticketResponse.event_id}`].state = 1;
                                                updateBetslipStore(1);
                                            } else if (betslipStore.matchById[`p${ticketResponse.event_id}`]) {
                                                betslipStore.matchById[`p${ticketResponse.event_id}`].state = 1;
                                                betslipOddsStore[`p${ticketResponse.event_id}`].state = 1;
                                                updateBetslipStore(1);
                                            }
                                        }
                                    }
                                    if (ticketResponse.min) {
                                        msg2 = msg2 ? `${msg2}:${ticketResponse.min}` : ticketResponse.min;
                                    }
                                    if (ticketResponse.max) {
                                        msg2 = msg2 ? `${msg2}:${ticketResponse.max}` : ticketResponse.max;
                                    }
                                    if (ticketResponse.position) {
                                        msg2 = `${msg2}:${ticketResponse.position}`;
                                    }
                                    g.new_notification({
                                        type: "error",
                                        notif_for: "betslip",
                                        time: 5000,
                                        msg1: ticketResponse.Message,
                                        msg2: msg2,
                                    });
                                    break;
                                }
                        }
                        return;
                    }
                    if (ticketResponse.Message === "ticket_delay") {
                        const {
                            ticket_id_tmp,
                            delay
                        } = ticketResponse;
                        ticketResubmitTimeout = setTimeout(async () => {
                            ticketResubmitTimeout = undefined;
                            await finalSubmitTicket(ticket_id_tmp);
                        }, delay * 1000);
                        return;
                    }
                    if (ticketResponse.Message === "ticket_hold") {
                        const {
                            ticket_id_tmp
                        } = ticketResponse;
                        const pendingTicket = {
                            ticket_id_tmp,
                            betslipStore,
                            betslipOddsFeed,
                            betslipOddsStore
                        };
                        g.parent.postMessage({
                            action: "set-localStorage",
                            payload: {
                                param: "pendingTicket",
                                value: JSON.stringify(pendingTicket)
                            }
                        }, "*");
                        spSocket.subscribe(`ts${ticket_id_tmp}`);
                        ticketResubmitTimeout = -1;
                        pendingTicketId = ticket_id_tmp;
                        retryTicketHoldTimeout(ticket_id_tmp);
                        return;
                    }
                    if (ticketResponse.Message === "ticket_submited") {
                        await handleTicketSubmitted(ticketResponse);
                    }
                    if (!spSocket.connected) {
                        spSocket.reconnect();
                    }
                    clearTimeout(ticketResubmitTimeout);
                    ticketResubmitTimeout = undefined;
                    break;
                }
            case "book-ticket":
                {
                    // const { stake, currency } = event.data.payload;
                    let submit_data = {
                        selections: [],
                    };
                    let exit = false;
                    betslipStore.matchAllIds.forEach((matchId) => {
                        // if (betslipStore.matchById[matchId].live) {
                        //   g.new_notification({
                        //     type: "error",
                        //     notif_for: "betslip",
                        //     time: 5000,
                        //     msg1: "book_ticket_not_allowed_for_live_match",
                        //   });
                        //   exit = true;
                        //   return;
                        // }
                        let matchIdReal = matchId;
                        // check if matchId starts with c1. and remove c1. for matchIdReal
                        if (typeof matchId === "string" && matchId.indexOf("c") === 0) {
                            matchIdReal = matchId.substring(3);
                        }
                        let matchBet = [matchIdReal.substring(1)];
                        if (tempStore.matchById && tempStore.matchById[matchIdReal]) {
                            matchBet.push(tempStore.matchById[matchIdReal].timestamp);
                        }
                        submit_data.selections.push(matchBet);
                    });
                    if (!exit) {
                        submit_data.betslipStore = betslipStore;
                        // let formData = new FormData();
                        // formData.append("data", JSON.stringify(submit_data));
                        g.parent.postMessage({
                                action: "book-ticket-api",
                                payload: {
                                    data: submit_data,
                                    haUrl: g.haUrl ? g.haUrl : undefined,
                                },
                            },
                            "*"
                        );
                    }
                    break;
                }
            case "book-ticket-response":
                {
                    const {
                        data
                    } = event.data.payload;
                    if (!data.Error && data.Message !== "error_not_logged_in") {
                        let out = {
                            action: "book-ticket",
                            payload: {
                                bookingCode: data.book_code
                            },
                        };
                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }

                        // clear betslip
                        betslipStore = {
                            matchAllIds: [],
                            matchById: {},
                            totalBets: 0,
                            totalOdds: 1,
                            totalOddsOrig: 1,
                        };
                        out = {
                            action: "betslip-store",
                            payload: {
                                betslipStore,
                                ticketStore
                            },
                        };
                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }
                        let {
                            toUnsubscribe
                        } = updateStoreInView("betslip", "clear", [], []);
                        if (spSocket) {
                            // let channel = matchStore[matchId].live ? 'l' : 'p';
                            spSocket.unSubscribe("", toUnsubscribe.matches, "match");
                        }
                    } else {
                        g.new_notification({
                            type: "error",
                            notif_for: "betslip",
                            time: 5000,
                            msg1: "book_ticket_failed",
                            msg2: data.Message,
                        });
                    }
                    break;
                }
            case "search-booking":
                {
                    const {
                        bookingCode
                    } = event.data.payload;
                    const {
                        shard
                    } = window.domainConfigs;
                    const keys = [`${shard}_book_${bookingCode}`];
                    const dataToSend = [
                        ["g", keys]
                    ];
                    const data = await g.platformApiCall("", "json", dataToSend, "nrdst", "json", 0);
                    const [bookingData] = keys.map((k, i) => data[i][k] || {});
                    if (!bookingData || !bookingData.betslipStore) {
                        g.new_notification({
                            time: 5000,
                            msg1: "booking_code_not_found",
                        });
                        return;
                    }
                    betslipStore = bookingData.betslipStore;
                    betslipStore.matchAllIds.forEach((matchId) => {
                        let match = betslipStore.matchById[matchId];
                        let matchIdReal = matchId;
                        if (!matchStore[matchIdReal]) {
                            matchStore[matchIdReal] = {
                                home: match.home,
                                away: match.away,
                                code: match.code,
                                live: match.live,
                            };
                        }
                        // check if matchId starts with c1. and remove c1. for matchIdReal
                        if (typeof matchId === "string" && matchId.indexOf("c") === 0) {
                            matchIdReal = matchId.substring(3);
                        }
                        match.betAllIds.forEach((betId) => {
                            let bet = match.betById[betId];
                            let {
                                marketId,
                                sbvId,
                                outcomeId,
                                odd
                            } = bet;
                            if (betslipOddsStore[matchIdReal]) {
                                if (betslipOddsStore[matchIdReal][marketId]) {
                                    return;
                                }
                                betslipOddsStore[matchIdReal][marketId] = {
                                    [sbvId]: {
                                        [outcomeId]: odd,
                                    },
                                };
                            } else {
                                betslipOddsStore[matchIdReal] = {
                                    [marketId]: {
                                        [sbvId]: {
                                            [outcomeId]: odd,
                                        },
                                    },
                                    state: 0,
                                };
                            }
                        });
                    });
                    let out = {
                        action: "betslip-store",
                        payload: {
                            betslipStore,
                            ticketStore
                        },
                    };
                    for (let i = 0; i < g.frames.length; i++) {
                        g.frames[i].postMessage(out, "*");
                    }
                    break;
                }
            case "accept-betslip-changes":
                {
                    updateBetslipStore(1);
                    break;
                }
            case "accept-bet-offer":
                {
                    const {
                        ticketId
                    } = event.data.payload;
                    if (ticketStore.byId[ticketId] && +ticketStore.byId[ticketId].newTicket === 1) {
                        ticketStore.allIds = ticketStore.allIds.filter((id) => id !== ticketId);
                        delete ticketStore.byId[ticketId];
                        clearBetslip();
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                        ticketResubmitTimeout = undefined;
                        await finalSubmitTicket(ticketId);
                        return;
                    }
                    let method = ".in?action=set";
                    method += "&subaction=accept_ticket_offer&ticket_id=" + ticketId;
                    g.platformApiCall(method, "json", {}, "api", "json", 2, (data) => {
                        if (!data.Error) {
                            ticketStore.byId[ticketId].state = 0;
                            g.new_notification({
                                type: "success",
                                notif_for: "bet_offer",
                                time: 5000,
                                msg1: "ticket_accepted",
                                msg2: ticketId,
                            });
                            g.new_notification({
                                type: "success",
                                notif_for: "betslip",
                                time: 5000,
                                msg1: ticketStore.byId[ticketId].round + "." + ticketStore.byId[ticketId].ops,
                                msg2: g.userStore.ticket_states[ticketStore.byId[ticketId].state],
                                ticketId: ticketStore.byId[ticketId].ticket_id,
                                ticketHeader: ticketStore.byId[ticketId],
                                ticketLines: ticketStore.byId[ticketId].ticketLines,
                            });
                        } else {
                            g.new_notification({
                                type: "error",
                                notif_for: "bet_offer",
                                time: 5000,
                                msg1: data.Message,
                            });
                        }
                        updateBetslipStore();
                    });
                    break;
                }
            case "reject-bet-offer":
                {
                    // reject_ticket - ticket_id_tmp, reason - feed_stop, offer_refused
                    const {
                        ticketId
                    } = event.data.payload;
                    ticketProcessing = false;
                    if (ticketStore.byId[ticketId] && +ticketStore.byId[ticketId].newTicket === 1) {
                        ticketStore.allIds = ticketStore.allIds.filter((id) => id !== ticketId);
                        delete ticketStore.byId[ticketId];
                        g.asyncPM({
                            action: "del-localStorage",
                            payload: {
                                param: "pendingTicket"
                            }
                        });
                        clearBetslip();
                        g.new_notification({
                            notif_for: "betslip",
                            time: 3000,
                            msg1: "offer_rejected",
                        });
                        g.platformApiCall(`.in?action=set&subaction=reject_ticket&ticket_id_tmp=${ticketId}&reason=offer_refused`, "json", {}, "api", "json", 2);
                        return;
                    }
                    let method = ".in?action=set";
                    method += "&subaction=reject_ticket_offer&ticket_id=" + ticketId;
                    g.platformApiCall(method, "json", {}, "api", "json", 2, (data) => {
                        if (!data.Error) {
                            ticketStore.byId[ticketId].state = 4;
                            g.new_notification({
                                type: "info",
                                notif_for: "bet_offer",
                                time: 5000,
                                msg1: "ticket_rejected",
                                msg2: ticketId,
                            });
                        } else {
                            g.new_notification({
                                type: "error",
                                notif_for: "bet_offer",
                                time: 5000,
                                msg1: data.Message,
                            });
                        }
                        updateBetslipStore();
                    });
                    break;
                }
            case "get-virtual-url":
                {
                    const data = event.data.payload;
                    const CallbackUrl = await getVirtualUrl(data);
                    if (CallbackUrl) {
                        let out = {
                            action: "get-virtual-url",
                            payload: {
                                CallbackUrl
                            },
                        };
                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }
                    }
                    break;
                }
            case "get-cashout-value":
                {
                    const {
                        ticketId,
                        payCode
                    } = event.data.payload;
                    let method = `.in?action=get&subaction=cashout_tickets&ticket_id=${ticketId}`;
                    if (payCode) method += `&pay_code=${payCode}`;
                    const data = await g.platformApiCall(method, "json", {}, "api", "json", 1);
                    if (!data.Error) {
                        const out = {
                            action: "get-cashout-value",
                            payload: {
                                cashoutValue: data.Message
                            },
                        };
                        for (let i = 0; i < g.frames.length; i++) {
                            g.frames[i].postMessage(out, "*");
                        }
                    } else {
                        let msg2 = "";
                        if (data.team) {
                            msg2 = data.team;
                        }
                        if (data.event_id) {
                            const line = g.tempTicketLines.find((m) => m.matchId === data.event_id);
                            if (line) {
                                msg2 = line.match;

                                //   TODO: check for market/outcome name
                            }
                        }
                        if (data.position) {
                            msg2 = `${msg2}:${data.position}`;
                        }

                        g.new_notification({
                            type: "error",
                            notif_for: "get_cashout",
                            time: 5000,
                            msg1: data.Message,
                            msg2,
                        });
                    }
                    break;
                }
            case "confirm-cashout":
                {
                    const {
                        ticketId,
                        cashoutValue,
                        payCode
                    } = event.data.payload;
                    let method = `.in?action=set&subaction=cashout_tickets&ticket_id=${ticketId}&cashout=${cashoutValue}`;
                    if (payCode) method += `&pay_code=${payCode}`;

                    const data = await g.platformApiCall(method, "json", {}, "api", "json", 2);
                    if (!data.Error) {
                        // console.log(data);
                        g.new_notification({
                            type: "success",
                            notif_for: "get_cashout",
                            time: 5000,
                            msg1: "cashout_successful",
                        });
                    } else {
                        let msg2 = "";
                        if (data.team) {
                            msg2 = data.team;
                        }
                        if (data.event_id) {
                            const line = g.tempTicketLines.find((m) => m.matchId === data.event_id);
                            if (line) {
                                msg2 = line.match;

                                //   TODO: check for market/outcome name
                            }
                        }
                        if (data.position) {
                            msg2 = `${msg2}:${data.position}`;
                        }

                        g.new_notification({
                            type: "error",
                            time: 5000,
                            msg1: data.Message,
                            msg2,
                        });
                    }
                    break;
                }
            case "open-sl-param":
                {
                    window.parent.postMessage({
                        action: "open-sl-param",
                        payload: event.data.payload
                    }, "*");
                    break;
                }
            default:
                {
                    // default
                }
        }
    });

    const finalSubmitTicket = async (ticket_id_tmp) => {
        const body = {
            ticket_id_tmp
        };
        const ticketResponseFinal = await g.platformApiCall(".in?action=set&subaction=ticket", "json", body, "api", "json", 2);
        if (ticketResponseFinal.Error) {
            ticketProcessing = false;
            let msg2 = "";
            if (ticketResponseFinal.position) {
                msg2 = ticketResponseFinal.position;
            } else if (ticketResponseFinal.min) {
                msg2 = ticketResponseFinal.min;
            } else if (ticketResponseFinal.max) {
                msg2 = ticketResponseFinal.max;
            } else if (ticketResponseFinal.team) {
                msg2 = ticketResponseFinal.team;
            } else if (ticketResponseFinal.event_id) {
                if (matchStore["l" + ticketResponseFinal.event_id]) {
                    msg2 = matchStore["l" + ticketResponseFinal.event_id].home + " - " + matchStore["l" + ticketResponseFinal.event_id].away;
                } else if (matchStore["p" + ticketResponseFinal.event_id]) {
                    msg2 = matchStore["p" + ticketResponseFinal.event_id].home + " - " + matchStore["p" + ticketResponseFinal.event_id].away;
                } else {
                    msg2 = ticketResponseFinal.event_id;
                }
                if (ticketResponseFinal.market_id) {
                    if (marketStore[ticketResponseFinal.market_id]) {
                        msg2 += " : " + marketStore[ticketResponseFinal.market_id].shortName;
                    } else {
                        msg2 += " : " + ticketResponseFinal.market_id;
                    }
                } else if (ticketResponseFinal.odd_id) {
                    const [marketId, sbvId, outcomeId] = ticketResponseFinal.odd_id.split("^");
                    if (marketStore[marketId]) {
                        msg2 += " : " + marketStore[marketId].shortName;
                    } else {
                        msg2 += " : " + marketId;
                    }
                    msg2 += ":" + sbvId;
                    if (marketStore[marketId]) {
                        if (marketStore[marketId].outcomeById[outcomeId]) {
                            msg2 += ":" + marketStore[marketId].outcomeById[outcomeId].name;
                        } else {
                            msg2 += ":" + outcomeId;
                        }
                    } else {
                        msg2 += ":" + outcomeId;
                    }
                }
            }
            g.new_notification({
                type: "error",
                notif_for: "betslip",
                time: 5000,
                msg1: ticketResponseFinal.Message,
                msg2: msg2,
            });
            return;
        }
        if (ticketResponseFinal.Message === "ticket_submited") {
            await handleTicketSubmitted(ticketResponseFinal);
        }
    };

    const getTicketTmpStatus = async (ticket_id_tmp) => {
        const pendingResponse = await g.platformApiCall(`.in?action=get&subaction=tmp_ticket&ticket_id_tmp=${ticket_id_tmp}`, "json", {}, "api", "json", 1);
        if (pendingResponse.Error) {
            ticketProcessing = false;
            g.asyncPM({
                action: "del-localStorage",
                payload: {
                    param: "pendingTicket"
                }
            });
            if (pendingResponse.Message === "error_not_found") return;
            g.new_notification({
                type: "error",
                notif_for: "betslip",
                time: 5000,
                msg1: "ticket_rejected",
                msg2: "",
            });
            return;
        }
        let out = {
            action: "betslip-loader",
            payload: {
                type: "show"
            },
        };
        for (let i = 0; i < g.frames.length; i++) {
            g.frames[i].postMessage(out, "*");
        }
        if (pendingResponse.Message === "ticket_delay") {
            const delay = +pendingResponse.delay > 0 ? +pendingResponse.delay : 0;
            ticketResubmitTimeout = setTimeout(async () => {
                ticketResubmitTimeout = undefined;
                const ticketResponseFinal = await g.platformApiCall(".in?action=set&subaction=ticket", "json", {
                    ticket_id_tmp
                }, "api", "json", 2);
                if (ticketResponseFinal.Error) {
                    ticketProcessing = false;
                    let msg2 = "";
                    if (ticketResponseFinal.position) {
                        msg2 = ticketResponseFinal.position;
                    } else if (ticketResponseFinal.min) {
                        msg2 = ticketResponseFinal.min;
                    } else if (ticketResponseFinal.max) {
                        msg2 = ticketResponseFinal.max;
                    } else if (ticketResponseFinal.team) {
                        msg2 = ticketResponseFinal.team;
                    } else if (ticketResponseFinal.event_id) {
                        if (matchStore["l" + ticketResponseFinal.event_id]) {
                            msg2 = matchStore["l" + ticketResponseFinal.event_id].home + " - " + matchStore["l" + ticketResponseFinal.event_id].away;
                        } else if (matchStore["p" + ticketResponseFinal.event_id]) {
                            msg2 = matchStore["p" + ticketResponseFinal.event_id].home + " - " + matchStore["p" + ticketResponseFinal.event_id].away;
                        } else {
                            msg2 = ticketResponseFinal.event_id;
                        }
                        if (ticketResponseFinal.market_id) {
                            if (marketStore[ticketResponseFinal.market_id]) {
                                msg2 += " : " + marketStore[ticketResponseFinal.market_id].shortName;
                            } else {
                                msg2 += " : " + ticketResponseFinal.market_id;
                            }
                        } else if (ticketResponseFinal.odd_id) {
                            const [marketId, sbvId, outcomeId] = ticketResponseFinal.odd_id.split("^");
                            if (marketStore[marketId]) {
                                msg2 += " : " + marketStore[marketId].shortName;
                            } else {
                                msg2 += " : " + marketId;
                            }
                            msg2 += ":" + sbvId;
                            if (marketStore[marketId]) {
                                if (marketStore[marketId].outcomeById[outcomeId]) {
                                    msg2 += ":" + marketStore[marketId].outcomeById[outcomeId].name;
                                } else {
                                    msg2 += ":" + outcomeId;
                                }
                            } else {
                                msg2 += ":" + outcomeId;
                            }
                        }
                    }
                    g.new_notification({
                        type: "error",
                        notif_for: "betslip",
                        time: 5000,
                        msg1: ticketResponseFinal.Message,
                        msg2: msg2,
                    });
                    return;
                }
                if (ticketResponseFinal.Message === "ticket_submited") {
                    await handleTicketSubmitted(ticketResponseFinal);
                }
            }, delay * 1000);
            return;
        }
        if (pendingResponse.Message === "new_offer") {
            const delay = +pendingResponse.delay > 0 ? +pendingResponse.delay : 0;
            setTimeout(() => {
                const {
                    odds = {}, stake, return_max
                } = pendingResponse.changes;
                const ticketHeader = {
                    newTicket: 1,
                    state: -2,
                    round: ticket_id_tmp,
                    ops: "",
                    stake: stake || betslipStore.stake,
                    return: return_max,
                    lines: []
                };
                for (const matchId in betslipStore.matchById) {
                    const {
                        home,
                        away,
                        betById
                    } = betslipStore.matchById[matchId];
                    const line = {
                        match: `${home} - ${away}`,
                        outcome_name: [],
                        specialbetvalue: [],
                        odd: []
                    };
                    for (const betId in betById) {
                        const {
                            marketName,
                            marketId,
                            outcomeId,
                            outcomeName,
                            sbvId,
                            odd
                        } = betById[betId];
                        const newOdd = odds[matchId.substring(1)] ? .[marketId] ? .[sbvId] ? .[outcomeId];
                        line.outcome_name.push(`${marketName}~${outcomeName}`);
                        line.specialbetvalue.push(sbvId);
                        line.odd.push((newOdd || odd ? .odd) / 100);
                    }
                    ticketHeader.lines.push(line);
                }
                ticketStore.byId[ticket_id_tmp] = ticketHeader;
                ticketStore.allIds.unshift(ticket_id_tmp);
                let out = {
                    action: "betslip-store",
                    payload: {
                        betslipStore,
                        ticketStore
                    },
                };
                for (let i = 0; i < g.frames.length; i++) {
                    g.frames[i].postMessage(out, "*");
                }
                g.new_notification({
                    time: 5000,
                    msg1: "ticket_offered",
                });
            }, delay * 1000);
            return;
        }
        if (pendingResponse.Message === "ticket_hold") {
            spSocket.subscribe(`ts${ticket_id_tmp}`);
            retryTicketHoldTimeout(ticket_id_tmp);
            return;
        }
        if (pendingResponse.Message === "accepted") {
            g.asyncPM({
                action: "del-localStorage",
                payload: {
                    param: "pendingTicket"
                }
            });
            const _data = await g.platformApiCall(`.in?action=get&subaction=ticket&ticket_id=${pendingResponse.id}`, "json", {}, "api", "json", 1);
            const {
                ticketHeader,
                ticketLines
            } = await g.buildTicketDetails(_data.data.ticket_data, _data.schema.ticket_header, _data.data.ticket_lines, _data.schema.lines_header);
            ticketHeader["pay_code"] = _data.paycode;
            ticketHeader.lines = ticketHeader.ticketLines;
            // ticketHeader["bonus_voucher"] = _data.bonus_voucher;
            ticketStore.byId[pendingResponse.id] = ticketHeader;
            ticketStore.allIds.unshift(pendingResponse.id);

            clearBetslip();

            let out = {
                action: "betslip-store",
                payload: {
                    betslipStore,
                    ticketStore
                },
            };
            for (let i = 0; i < g.frames.length; i++) {
                g.frames[i].postMessage(out, "*");
            }

            let notifType;
            if (+ticketHeader.state === -1 || +ticketHeader.state === -3) {
                spSocket.subscribe(`ts${ticketHeader.ticket_id}`);
            } else if (+ticketHeader.state === -2) {
                // Offered ticket
            } else if (+ticketHeader.state === 0) {
                notifType = "success";
            } else if (+ticketHeader.state === 3 || +ticketHeader.state === 4) {
                notifType = "error";
            }

            g.new_notification({
                type: notifType,
                notif_for: "betslip",
                time: 5000,
                msg1: ticketHeader.round + "." + ticketHeader.ops,
                msg2: g.userStore.ticket_states[ticketHeader.state],
                ticketId: ticketHeader.ticket_id,
                ticketHeader,
                ticketLines,
            });
        }
    };

    const retryTicketHoldTimeout = (ticket_id_tmp) => {
        ticketHoldTimeout = setTimeout(async () => {
            await getTicketTmpStatus(ticket_id_tmp);
        }, 60000);
    };

    const getTicketHash = async () => {
        const hash = await g.platformApiCall(".in?action=set&subaction=insert_tickets", "json", {
            get_request: 1
        }, "api", "json", 2);
        return {
            error: hash.Error,
            id: hash.Message
        };
    };

    initApp().then(() => {});
    setInterval(() => {
        for (let id in oddsChangeStore) {
            if (oddsChangeStore.hasOwnProperty(id)) {
                if (Date.now() - oddsChangeStore[id] > 20000) {
                    delete oddsChangeStore[id];
                }
            }
        }
    }, 20000);
})(window);