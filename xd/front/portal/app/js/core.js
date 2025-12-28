/* eslint-disable no-prototype-builtins */
"use strict";
if (!localStorage) {
    window.localStorage = {
        setItem: function() {},
    };
}
var API_Access_Token;
var domainConfigs = {};
var haUrl = "";
var rev = 333;
var lastApp = "sport";
var userStore = {
    username: "nologin",
    parameters: {},
    ticket_states: {
        "-3": "pending",
        "-2": "new_offer",
        "-1": "pending",
        0: "active",
        1: "winner",
        2: "loser",
        3: "canceled",
        4: "rejected",
        5: "offered",
    },
    ticket_line_states: {
        0: "active",
        1: "winner",
        2: "loser",
        3: "canceled",
        6: "cachout",
        11: "draw_no_bet",
        12: "half_loser",
        13: "half_winner",
    },
};
var auth_hash;
var notifId = 0;

var tempAccountCategs = [];
var tempAccountStatement = {};

// let jwtAuth = false;
var lToken;
let gFailedFetch = 0;

const getDomainConfigs = async (domain) => {
    const configs = {};
    return fetch(`${window.facePath}cnf/current/${domain}/cnf.txt`, {
            cache: "no-store"
        })
        .then((response) => {
            if (response.status !== 200) {
                console.log("Error reading file. Status Code: " + response.status);
                return configs;
            }
            return response.text().then((data) => {
                data.split("\n").forEach(function(param) {
                    param = param.split("=");
                    if (param.length === 2 && param[0] !== "" && param[1] !== "") {
                        configs[param[0]] = param[1].replace(/\r?\n|\r/g, "");
                    }
                });
                return configs;
            });
        })
        .catch((error) => {
            console.error(error);
            return configs;
        });
};

async function initFMwareCore(domain) {
    domainConfigs = await getDomainConfigs(domain);
    if (+domainConfigs.core_v === 2) {
        window.parent.postMessage({
            action: "set-localStorage",
            payload: {
                param: "core_v",
                value: 2
            }
        }, "*");
        window.parent.postMessage({
            action: "reload"
        }, "*");
    }
    if (domainConfigs.light_sport * 1 === 1) {
        window.parent.postMessage({
            action: "redirect",
            payload: {
                path: "./front/light-sport/"
            }
        }, "*");
    }
    domainConfigs.domain = window.domain;
    if (!API_Access_Token && !domainConfigs.nologin_sportmodel) {
        document.location.href = document.location.href.replace("portal", "login");
    }
    if (domainConfigs.haUrl) {
        haUrl = domainConfigs.haUrl;
        if (haUrl.slice(-1) !== "/") {
            haUrl += "/";
        }
    }
    if (domainConfigs.title) {
        window.parent.postMessage({
            action: "set-title",
            payload: {
                title: domainConfigs.title
            }
        }, "*");
    }
    // TODO: set favicon
    if (domainConfigs.skin_path) {
        const path = `${domainConfigs.skin_path}/favicon.ico`;
        window.parent.postMessage({
            action: "set-favicon",
            payload: {
                path
            }
        }, "*");
    }

    if (domainConfigs["default_tmz"]) {
        userStore.userTimezone = domainConfigs["default_tmz"];
        window.moment.tz.setDefault(userStore.userTimezone);
    }
    if (domainConfigs.shard && domainConfigs.part) {
        // jwtAuth = true;
        window.platformApiCall = platformApiCall;
    }

    await getUserStore();
    if (sessionStorage.lastAppView && (sessionStorage.lastAppView === "casino" || sessionStorage.lastAppView === "casino_live" || sessionStorage.lastAppView === "virtual_slots")) {
        lastApp = "casino";
    } else if (sessionStorage.lastAppView && (sessionStorage.lastAppView === "casino1.2" || sessionStorage.lastAppView === "casino1.2_live")) {
        lastApp = "casino1.2";
    } else if (sessionStorage.lastAppView && (sessionStorage.lastAppView === "casino2" || sessionStorage.lastAppView === "casino2_live")) {
        lastApp = "casino2";
    } else if (sessionStorage.lastAppView && (sessionStorage.lastAppView === "casino3" || sessionStorage.lastAppView === "casino3_live")) {
        lastApp = "casino3";
    } else if (sessionStorage.lastAppView && (sessionStorage.lastAppView === "casino4" || sessionStorage.lastAppView === "casino4_live")) {
        lastApp = "casino4";
    } else if (
        sessionStorage.lastAppView &&
        (sessionStorage.lastAppView === "casino4.1" || sessionStorage.lastAppView === "casino4.1_gold" || sessionStorage.lastAppView === "casino4.2")
    ) {
        lastApp = "casino4.1";
    } else if (sessionStorage.lastAppView && sessionStorage.lastAppView === "casino5") {
        lastApp = "casino5";
    } else if (sessionStorage.lastAppView && sessionStorage.lastAppView === "casino_gcm") {
        lastApp = "casino_gcm";
    } else if (sessionStorage.lastAppView && sessionStorage.lastAppView.startsWith("casino")) {
        lastApp = "casino_gcm";
        sessionStorage.casinoGroup = sessionStorage.lastAppView.split("~")[1];
    } else if (+domainConfigs.core_v === 1.2) {
        lastApp = "sport";
    } else {
        lastApp = "sport";
    }
    loadApp(lastApp);
}

async function platformApiCall(method, dataType, dataToSend, apiType, respType, withAuth, callback) {
    let url = haUrl || "/";
    if (apiType === "api") {
        // url += "back/";
        const method = withAuth === 1 ? "get" : "set";
        url += `ousr/${method}/in/`;
    } else if (apiType === "apic") {
        url += "rdstn";
    } else if (apiType === "apic_old") {
        url += "rdst";
    } else if (apiType === "nrdst") {
        if (window.location.host.includes("devel")) {
            url += `rdstn_devel`;
        } else {
            url += `rdstn`;
        }
        // url = `http://localhost:8081/rdstn`;
    }
    url += method;
    let headers = {
        "Content-Type": "text/plain",
    };
    if (withAuth === 1) {
        if (!lToken) {
            lToken = await getToken();
        }
        headers = {
            "Content-Type": "application/json",
            "x-access-token": lToken,
        };
        // url += "&domain=" + window.domain;
    } else if (withAuth === 2) {
        headers = {
            // "Content-Type": "application/json",
            "x-access-token": await getToken("s"),
        };
    }
    if (lToken) {
        headers["x-access-login"] = `${domainConfigs.shard}:${domainConfigs.part}:${userStore.username}`;
    }
    return fetch(url, {
            method: "POST",
            body: dataType === "json" ? JSON.stringify(dataToSend) : dataToSend,
            headers,
        })
        .then((response) => {
            if (response.ok) {
                return response;
            } else {
                throw new Error("Failed to fetch");
            }
        })
        .then((response) => (respType === "json" ? response.json() : response.text()))
        .then(async (data) => {
            if (typeof data === "string" && data.indexOf("MASTERDOWN Link with MASTER is down") > -1) {
                throw new Error("Failed to fetch");
            }
            if (data.Error) {
                if (data.Message === "error_not_logged_in") {
                    window.parent.postMessage({
                        action: "delete-cred"
                    }, "*");
                    document.getElementById("expired").classList.remove("hide");
                } else if (data.Message === "error_token_expired") {
                    if (withAuth === 1) {
                        gFailedFetch++;
                        if (gFailedFetch > 1) {
                            return;
                        }
                        lToken = await getToken();
                        if (lToken) {
                            return platformApiCall(method, dataType, dataToSend, apiType, respType, withAuth, callback);
                        }
                    }
                } else {
                    if (callback) {
                        callback(data);
                    }
                    return data;
                }
            } else {
                gFailedFetch = 0;
                if (apiType === "nrdst" || apiType === "apic") {
                    try {
                        for (const r of data) {
                            for (const k in r) {
                                if (r[k] ? .[0] === "{" || r[k] ? .[0] === "[") {
                                    r[k] = JSON.parse(r[k]);
                                    continue;
                                }
                                for (const i in r[k]) {
                                    if (r[k][i] ? .[0] === "{" || r[k][i] ? .[0] === "[" || r[k][i] ? .[0] === '"') {
                                        r[k][i] = JSON.parse(r[k][i]);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.log(e.message);
                    }
                }
                if (callback) {
                    callback(data);
                }
                return data;
            }
        })
        .catch(function(error) {
            console.log(error.message);
        });
}

async function getToken(type = "l") {
    let url = haUrl || "/";
    const headers = {
        "Content-Type": "application/json",
    };
    if (API_Access_Token) {
        headers["x-access-token"] = API_Access_Token;
        headers["x-access-login"] = `${domainConfigs.shard}:${domainConfigs.part}:${userStore.username}`;
    }
    return fetch(`${url}aaa/token_${type}`, {
            method: "POST",
            headers,
        })
        .then((response) => {
            if (response.status === 200) {
                return response;
            } else {
                window.parent.postMessage({
                    action: "delete-cred"
                }, "*");
                document.getElementById("expired").classList.remove("hide");
            }
        })
        .then((response) => response.json())
        .then((data) => {
            if (data && data[`${type}Token`]) {
                return data[`${type}Token`];
            }
        })
        .catch(() => {});
}

async function getUserStore() {
    if (domainConfigs["languages"]) {
        userStore.userLang = domainConfigs["languages"].split(",")[0];
    }
    if (domainConfigs["default_lang"]) {
        userStore.userLang = domainConfigs["default_lang"];
        if (!domainConfigs["languages"]) {
            domainConfigs["languages"] = userStore.userLang;
        }
    }
    if (localStorage["lastUser"]) {
        var u = localStorage["lastUser"];
        if (localStorage[u]) {
            const d = JSON.parse(localStorage[u]);
            if (d["userLang"] !== undefined) {
                userStore.userLang = d["userLang"];
            }
        }
    } else {
        if (localStorage["nologin"]) {
            const d = JSON.parse(localStorage["nologin"]);
            if (d["userLang"] !== undefined) {
                userStore.userLang = d["userLang"];
            }
        }
    }
    if (userStore.userLang === "al") {
        window.moment.locale("sq");
    } else {
        window.moment.locale(userStore.userLang);
    }

    if (!window.API_Access_Token || window.API_Access_Token === "") return;

    const data = await platformApiCall(".in?action=init", "json", {}, "api", "json", 1);
    if (data.Error || data.Message === "error_not_logged_in") return;

    userStore = { ...userStore,
        ...data
    };
    userStore.username = userStore.parameters.username;
    userStore.ltoken = lToken;
    userStore.API_Access_Token = window.API_Access_Token;
    if (userStore.parameters.auth_services) {
        try {
            userStore.parameters.auth_services = JSON.parse(userStore.parameters.auth_services.substr(2));
        } catch (e) {
            console.log(e);
        }
    }
    if (userStore.parameters.auth_services_hi) {
        try {
            userStore.parameters.auth_services_hi = JSON.parse(userStore.parameters.auth_services_hi.substr(2));
            userStore.parameters.auth_services = {
                ...userStore.parameters.auth_services,
                ...userStore.parameters.auth_services_hi,
            };
        } catch (e) {
            console.log(e);
        }
    }

    if (localStorage[userStore.username]) {
        const d = JSON.parse(localStorage[userStore.username]);
        if (d["userLang"] !== undefined) {
            userStore.userLang = d["userLang"];
        }
    }
    if (userStore.userLang === "al") {
        window.moment.locale("sq");
    } else {
        window.moment.locale(userStore.userLang);
    }
    userStore.userTimezone = data["timezone"];
    window.moment.tz.setDefault(userStore.userTimezone);
    localStorage.setItem("lastUser", userStore.username);

    if (sessionStorage["lastAppView"] && sessionStorage["lastAppView"] !== lastApp) {
        lastApp = sessionStorage["lastAppView"];
    }

    if (sessionStorage[`${userStore.username}_currencies`]) {
        try {
            const userCurrencies = JSON.parse(sessionStorage[`${userStore.username}_currencies`]);
            userStore.userCurrencies = userCurrencies;
            const tempCurr = userStore.parameters["valuta_baze"];
            if (userCurrencies.find((currency) => +currency.id === +tempCurr)) {
                userStore["userBaseCurrency"] = tempCurr;
            } else {
                userStore.userBaseCurrency = userCurrencies[0] ? userCurrencies[0].id : 0;
            }
        } catch (e) {
            console.log(e);
        }
    } else {
        await getFunds();
    }
}

function loadApp(lastApp) {
    if (document.getElementById("app-cs")) {
        document.getElementById("app-cs").remove();
    }
    var script = document.createElement("script");
    script.id = "app-cs";
    script.src = "app/js/" + lastApp + ".js?r=" + rev;
    document.body.appendChild(script);
}

function get_account_categories() {
    var method = ".in?action=init&type=account_report";
    return platformApiCall(method, "json", {}, "api", "j", 1, (data) => {
        if (data.indexOf("j:") === 0) {
            data = data.substr(2);
        }
        data = JSON.parse(data);
        if (data.Error) {
            alert(data.Message);
        } else {
            tempAccountCategs = data;
        }
    });
}

function get_statement_self(payload) {
    const {
        start_date,
        end_date,
        currency
    } = payload;
    var method = ".in?action=get&subaction=account_report&view=self";
    method += "&start_date=" + start_date;
    method += "&end_date=" + end_date;
    method += "&currency=" + currency;
    return platformApiCall(method, "json", {}, "api", "json", 1, (data) => {
        if (data.Error) {
            alert(data.Message);
        } else {
            tempAccountStatement = data;
        }
    });
}

function new_notification(notifObj) {
    const out = {
        action: "new-notification",
        payload: {
            // 'action' : {'name' : 'view'},
            ...notifObj,
            id: notifId++,
        },
    };
    for (var i = 0; i < window.frames.length; i++) {
        window.frames[i].postMessage(out, "*");
    }
}

function loadLiveChat() {
    try {
        if (!window.chat_loaded) {
            window.LC_API = {};
            window.LC_API.on_after_load = function() {
                window.LC_API.open_chat_window();
                for (var i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage({
                        action: "hide-action-loading"
                    }, "*");
                }
            };
            window.LC_API.on_chat_window_opened = function() {
                // $('#wait_loading_container').addClass('hide');
            };
            window.__lc = window.__lc || {};
            window.__lc.license = domainConfigs["livechatinc"];
            (function() {
                var lc = document.createElement("script");
                lc.type = "text/javascript";
                lc.async = true;
                lc.src = ("https:" === document.location.protocol ? "https://" : "http://") + "cdn.livechatinc.com/tracking.js";
                var s = document.getElementsByTagName("script")[0];
                s.parentNode.insertBefore(lc, s);
            })();
            window.chat_loaded = true;
        } else {
            if (window.LC_API !== "undefined") {
                window.LC_API.open_chat_window();
                for (var i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage({
                        action: "hide-action-loading"
                    }, "*");
                }
            }
        }
    } catch (err) {
        console.log(err);
    }
}

async function buildTicketDetails(headerData, headerSchema, linesData, linesSchema) {
    const ticketHeader = {};
    const ticketLines = [];
    const m_to_translate = {};
    const ml_to_translate = {};
    if (headerData) {
        for (const prop in headerSchema) {
            if (headerSchema.hasOwnProperty(prop)) {
                if (prop === "ops") {
                    const t = headerData[headerSchema[prop]].split("#");
                    ticketHeader[prop] = t[1];
                    if (t[0].substring(0, 2) === "mb") {
                        const tt = t[0].split("~");
                        const nrBets = tt[2].split(",").reduce((s, num) => s + nCr(tt[1], num), 0);
                        ticketHeader["multibet"] = [tt[2], tt[1], nrBets];

                        const ttt = t[0].split("~~");
                        if (ttt[1]) {
                            try {
                                ticketHeader["banked"] = JSON.parse(ttt[1]);
                            } catch (e) {
                                console.log(e.message);
                            }
                        }
                    }
                    ticketHeader["full_ops"] = headerData[headerSchema[prop]];
                } else if (prop === "round") {
                    ticketHeader[prop] = (headerData[headerSchema[prop]] + "").substr(-3);
                } else if (prop === "time") {
                    ticketHeader["time"] = window.moment(headerData[headerSchema[prop]] * 1000).format("L, HH:mm:ss");
                    ticketHeader["full_time"] = window.moment(headerData[headerSchema[prop]] * 1000).format("dddd, D MMMM YYYY HH:mm:ss");
                } else {
                    ticketHeader[prop] = headerData[headerSchema[prop]];
                }
            }
        }
        if (ticketHeader.state === 0 && userStore.parameters["biletat_anullo_time"]) {
            if (window.moment() / 1000 - +headerData[headerSchema["time"]] <= userStore.parameters["biletat_anullo_time"] * 60) {
                if (userStore.parameters["biletat_anullo_shuma_" + ticketHeader.currency]) {
                    if (+ticketHeader.stake <= +userStore.parameters["biletat_anullo_shuma_" + ticketHeader.currency]) {
                        ticketHeader["allowCancelTicket"] = true;
                    }
                } else {
                    ticketHeader["allowCancelTicket"] = true;
                }
            }
        }
        // ticketHeader.return_no_bonus = (ticketHeader.return_min / (1 + ticketHeader.bonus / 100)).toFixed(2);
    }
    if (linesData) {
        for (let matchId in linesData) {
            if (linesData.hasOwnProperty(matchId)) {
                const matchBet = linesData[matchId];
                const betObj = {
                    matchId
                };
                try {
                    if (ticketHeader.banked && ticketHeader.banked.includes(matchId)) {
                        betObj.banked = true;
                    }
                } catch (e) {
                    console.log(e.message);
                }
                // check if matchId starts with c1. and remove c1. for matchIdReal
                if (typeof matchId === "string" && matchId.indexOf("c") === 0) {
                    matchId = matchId.substr(3);
                }
                for (const prop in linesSchema) {
                    if (linesSchema.hasOwnProperty(prop)) {
                        if (prop === "time") {
                            betObj["time"] = window.moment(matchBet[linesSchema[prop]] * 1000).format("L, HH:mm");
                        } else if (prop === "tour_info") {
                            betObj[prop] = matchBet[linesSchema[prop]];
                            if (matchBet[linesSchema[prop]]) {
                                const t = matchBet[linesSchema[prop]].split("::");
                                betObj["category"] = t[0];
                                betObj["tour"] = t[1];
                            } else {
                                if (matchBet[linesSchema["live"]]) {
                                    if (window.matchStore["l" + matchId]) {
                                        if (window.tempStoreLive.categById[window.matchStore["l" + matchId].categId]) {
                                            betObj["category"] = window.tempStoreLive.categById[window.matchStore["l" + matchId].categId].name;
                                        }
                                        if (window.tempStoreLive.tourById[window.matchStore["l" + matchId].tourId]) {
                                            betObj["tour"] = window.tempStoreLive.tourById[window.matchStore["l" + matchId].tourId].name;
                                        }
                                    }
                                } else {
                                    if (window.tempStore.categById[window.matchStore["p" + matchId].categId]) {
                                        betObj["category"] = window.tempStore.categById[window.matchStore["p" + matchId].categId].name;
                                    }
                                    if (window.tempStore.tourById[window.matchStore["p" + matchId].tourId]) {
                                        betObj["tour"] = window.tempStore.tourById[window.matchStore["p" + matchId].tourId].name;
                                    }
                                }
                            }
                        } else {
                            betObj[prop] = matchBet[linesSchema[prop]];
                        }
                    }
                }
                betObj["sportName"] = "";
                if (window.tempStore.sportById && window.tempStore.sportById[matchBet[linesSchema["sport"]]]) {
                    betObj["sportName"] = window.tempStore.sportById[matchBet[linesSchema["sport"]]].name;
                }
                if (window.tempStoreLive.sportById && window.tempStoreLive.sportById[matchBet[linesSchema["sport"]]]) {
                    betObj["sportName"] = window.tempStoreLive.sportById[matchBet[linesSchema["sport"]]].name;
                }
                // TODO: Fix tempStoreLive bug in sport.js
                // get market translations
                for (let j = 0; j < betObj["oddstype_id"].length; j++) {
                    const _m_id = betObj["oddstype_id"][j];
                    const _s_id = betObj["sport"];
                    if (betObj["live"] === 1) {
                        if (!ml_to_translate[_s_id]) {
                            ml_to_translate[_s_id] = [];
                        }
                        if (!window.tempStoreLive.marketTranslation[_m_id] && !ml_to_translate[_s_id].includes(_m_id)) {
                            ml_to_translate[_s_id].push(_m_id);
                        }
                    } else {
                        if (!m_to_translate[_s_id]) {
                            m_to_translate[_s_id] = [];
                        }
                        if (!window.tempStore.marketTranslation[_m_id] && !m_to_translate[_s_id].includes(_m_id)) {
                            m_to_translate[_s_id].push(_m_id);
                        }
                    }
                }

                const outcome_display_arr = [];
                const outcomeObj = [];
                for (let j = 0; j < betObj["outcome_name"].length; j++) {
                    let outcome_display = "";
                    const market_name = betObj["outcome_name"][j].split("~")[0];
                    const outcome = betObj["outcome_name"][j].split("~")[1];
                    if (betObj["live"] === 1) {
                        outcome_display += "(L)";
                    }
                    outcome_display += market_name;
                    if (betObj["specialbetvalue"][j] !== "") {
                        outcome_display += "(" + betObj["specialbetvalue"][j] + ")";
                    }
                    outcome_display += "-" + outcome;
                    if (betObj["result"][j] !== "") {
                        outcome_display += "[" + betObj["result"][j] + "]";
                    }
                    outcome_display += "@" + betObj["odd"][j];
                    outcome_display_arr.push(outcome_display);

                    const tempObj = {
                        marketId: betObj["oddstype_id"][j],
                        marketShortName: market_name,
                        sbv: betObj["specialbetvalue"][j],
                        outcomeId: betObj["outcome_id"][j],
                        outcomeName: outcome,
                        result: betObj["result"][j],
                        odd: betObj["odd"][j],
                    };
                    const marketTranslationPointer = betObj["live"] === 1 ? window.tempStoreLive.marketTranslation : window.tempStore.marketTranslation;
                    if (marketTranslationPointer[tempObj.marketId]) {
                        tempObj["marketShortName"] = marketTranslationPointer[tempObj.marketId]["shortName"];
                        tempObj["marketLongName"] = marketTranslationPointer[tempObj.marketId]["longName"];
                        tempObj["marketDescription"] = marketTranslationPointer[tempObj.marketId]["description"];
                    }
                    if (
                        window.outcomeToAlias[tempObj.marketId] &&
                        window.outcomeToAlias[tempObj.marketId][`s${tempObj.sbv}`] &&
                        window.outcomeToAlias[tempObj.marketId][`s${tempObj.sbv}`][tempObj.outcomeId]
                    ) {
                        const {
                            aId,
                            aName,
                            aoName,
                            oId
                        } = window.outcomeToAlias[tempObj.marketId][`s${tempObj.sbv}`][tempObj.outcomeId];
                        tempObj.marketId = aId;
                        tempObj.marketShortName = aName;
                        tempObj.sbv = "";
                        tempObj.outcomeId = oId;
                        tempObj.outcomeName = aoName;
                    }
                    if (window.marketTemplates && window.marketTemplates["hnd"]) {
                        const temp = window.marketTemplates["hnd"];
                        if (temp["mids"] && (temp["mids"].includes(tempObj.marketId + "") || temp["mids"].includes(tempObj.marketId))) {
                            const s = tempObj.sbv;
                            if (outcome * 1 === 2) {
                                tempObj.outcomeName += -s > 0 ? ` (+${-s})` : ` (${-s})`;
                            } else {
                                tempObj.outcomeName += s > 0 ? ` (+${s})` : ` (${s})`;
                            }
                            tempObj.sbv = "";
                            tempObj.template = "hnd";
                        }
                    }
                    outcomeObj.push(tempObj);
                }
                betObj["outcome_display"] = outcome_display_arr;
                betObj["outcomeObj"] = outcomeObj;
                ticketLines.push(betObj);
            }
        }
    }
    if (ticketHeader.ticket_id && window.ticketStore && window.ticketStore.byId && window.ticketStore.byId[ticketHeader.ticket_id]) {
        ticketHeader["pay_code"] = window.ticketStore.byId[ticketHeader.ticket_id].pay_code;
    }
    const lang = userStore.userLang || "en";
    const {
        shard
    } = window.domainConfigs;
    const dataToSend = [];
    for (const s in m_to_translate) {
        if (m_to_translate.hasOwnProperty(s)) {
            if (m_to_translate[s].length > 0) {
                dataToSend.push(["gf", [`${shard}_ctm` + s + "_" + lang], m_to_translate[s]]);
            }
        }
    }
    for (const s in ml_to_translate) {
        if (ml_to_translate.hasOwnProperty(s)) {
            if (ml_to_translate[s].length > 0) {
                dataToSend.push(["gf", [`${shard}_ctm` + s + "_" + lang], ml_to_translate[s]]);
            }
        }
    }
    if (dataToSend.length > 0) {
        await platformApiCall("", "json", dataToSend, "nrdst", "json", 0, (data) => {
            let i = 0;
            for (const s in m_to_translate) {
                if (m_to_translate.hasOwnProperty(s)) {
                    if (data[i] && data[i][`${shard}_ctm` + s + "_" + lang] && data[i][`${shard}_ctm` + s + "_" + lang] !== "failed") {
                        const dd = data[i][`${shard}_ctm` + s + "_" + lang];
                        for (const m_id in dd) {
                            if (dd.hasOwnProperty(m_id) && dd[m_id]) {
                                window.tempStore.marketTranslation[m_id] = {
                                    shortName: dd[m_id][0],
                                    longName: dd[m_id][1],
                                    description: dd[m_id][2],
                                };
                            }
                        }
                        i++;
                    }
                }
            }
            for (const s in ml_to_translate) {
                if (ml_to_translate.hasOwnProperty(s)) {
                    if (data[i] && data[i][`${shard}_ctm` + s + "_" + lang] && data[i][`${shard}_ctm` + s + "_" + lang] !== "failed") {
                        const dd = data[i][`${shard}_ctm` + s + "_" + lang];
                        for (const m_id in dd) {
                            if (dd.hasOwnProperty(m_id) && dd[m_id]) {
                                window.tempStoreLive.marketTranslation[m_id] = {
                                    shortName: dd[m_id][0],
                                    longName: dd[m_id][1],
                                    description: dd[m_id][2],
                                };
                            }
                        }
                        i++;
                    }
                }
            }
            ticketLines.forEach((match) => {
                match.outcomeObj.forEach((o) => {
                    const marketTranslationPointer = match.live ? window.tempStoreLive.marketTranslation : window.tempStore.marketTranslation;
                    if (marketTranslationPointer[o.marketId]) {
                        o["marketShortName"] = marketTranslationPointer[o.marketId]["shortName"];
                        o["marketLongName"] = marketTranslationPointer[o.marketId]["longName"];
                        o["marketDescription"] = marketTranslationPointer[o.marketId]["description"];
                    }
                });
            });
        });
    }
    ticketLines.forEach((match) => {
        if (match.match.includes("^^") && match.match.split("^^")[2]) {
            match.outcomeObj.forEach((o) => {
                let i = 0;
                if (o.outcomeId * 1 === 2002) {
                    i = 1;
                }
                if (o.outcomeId * 1 === 2003) {
                    i = 2;
                }
                o["marketShortName"] = `${match.match.split("^^")[0]}-${match.match.split("^^")[2].split(";")[i]}`;
                o["marketLongName"] = `${match.match.split("^^")[0]}-${match.match.split("^^")[2].split(";")[i]}`;
                o["marketDescription"] = `${match.match.split("^^")[0]}-${match.match.split("^^")[2].split(";")[i]}`;
                o["outcomeName"] = "";
            });
            match.match = match.match.split("^^")[0];
        }
    });
    ticketHeader.ticketLines = ticketLines;
    console.log({
        ticketHeader,
        ticketLines
    });
    return {
        ticketHeader,
        ticketLines
    };
}

function nCr(n, r) {
    if (r > n) {
        return -1;
    }
    if (n - r < r) {
        return nCr(n, n - r);
    }
    let ret = 1;
    for (let i = 0; i < r; i++) {
        ret *= (n - i) / (i + 1);
    }
    return ret;
}

async function requestWithdraw(data) {
    const {
        amount,
        currency_id,
        ...rest
    } = data;
    const dataToSend = {
        amount: +amount,
        currency_id: +currency_id,
        extra: JSON.stringify(rest)
    };
    const url = `/srv2/upm/transaction/withdraw`;
    return fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-access-token": await getToken("s"),
            },
            body: JSON.stringify(dataToSend),
        })
        .then((response) => response.json())
        .catch(() => {
            return {
                error: true,
                message: "request_withdraw_failed"
            };
        });
}

async function resetPassword({
    username,
    newpassword,
    email,
    lang
}) {
    const url = `/srv2/recover_pass/?forgot=1`;
    let formData = new FormData();
    formData.append("username", username);
    formData.append("newpassword", newpassword);
    formData.append("email", email);
    formData.append("lang", lang);
    return fetch(url, {
            method: "POST",
            body: formData,
        })
        .then((response) => response.text())
        .then((response) => {
            alert(response);
        })
        .catch(() => {
            alert("Something went wrong!");
        });
}

async function getCasinoGroups(casinoModel) {
    const {
        shard
    } = window.domainConfigs;
    const groups = [];
    const key = `${shard}_casino_groups_${casinoModel}`;
    const dataToSend = [
        ["ga", [key]]
    ];
    const data = await platformApiCall("", "json", dataToSend, "nrdst", "json", 0);
    const _g = data ? .[0] ? .[key] || {};
    for (const id in _g) {
        groups.push({
            id,
            ..._g[id]
        });
    }
    return groups;
}

async function getReqHash(method) {
    return await platformApiCall(`${method}&get_request`, "json", {}, "api", "json", 2);
}

const getFunds = async (currId) => {
    let method = ".in?action=get&subaction=balance";
    if (currId) {
        method += `&currency=${currId}`;
    }
    const data = await platformApiCall(method, "json", {}, "api", "json", 1);
    if (!data || data.Error || data.Message === "error_not_logged_in") return;

    for (const [id, value] of Object.entries(data)) {
        const [balance, overdraft, pending] = value;
        userStore.parameters[`balance_${id}`] = balance;
        userStore.parameters[`overdraft_${id}`] = overdraft;
        userStore.parameters[`garanci_${id}`] = pending;
    }

    const userCurrencies = [];

    for (const [id, name] of Object.entries(userStore.currencies || {})) {
        if (userStore.parameters[`balance_${id}`] || userStore.parameters[`overdraft_${id}`] || userStore.parameters[`garanci_${id}`]) {
            userCurrencies.push({
                id,
                name
            });
        }
    }
    if (userCurrencies.length === 0) {
        userCurrencies.push({
            id: userStore.parameters["valuta_baze"],
            name: userStore.currencies[userStore.parameters["valuta_baze"]],
        });
    }
    userStore.userCurrencies = userCurrencies;
    const tempCurr = userStore.parameters["valuta_baze"];
    if (userStore.parameters["balance_" + tempCurr] || userStore.parameters["overdraft_" + tempCurr] || userStore.parameters["garanci_" + tempCurr]) {
        userStore["userBaseCurrency"] = tempCurr;
    } else {
        userStore.userBaseCurrency = userCurrencies[0] ? userCurrencies[0].id : 0;
    }

    sessionStorage.setItem(`${userStore.username}_currencies`, JSON.stringify(userCurrencies));

    const out = {
        action: "userStore-update",
        payload: {
            userStore
        },
    };
    for (let i = 0; i < window.frames.length; i++) {
        window.frames[i].postMessage(out, "*");
    }
};

window.addEventListener("message", async (event) => {
    switch (event.data.action) {
        case "app-init":
            {
                const {
                    domain,
                    params = "",
                    facePath
                } = event.data.payload;
                window.domain = domain;
                window.params = params;
                window.facePath = facePath;
                API_Access_Token = event.data.payload.token;
                const view = /view=([^(&#)]*)/.exec(params);
                if (view ? .[1]) {
                    window.urlView = view[1];
                }
                const urlParams = {};
                params.split("&").forEach((p) => {
                    const t = p.split("=");
                    urlParams[t[0]] = t[1];
                });
                window.urlParams = urlParams;
                await initFMwareCore(domain, params);
                break;
            }
        case "loadApp":
            {
                const {
                    app,
                    filter
                } = event.data.payload;
                sessionStorage.lastAppView = app + (filter ? ":" + filter : "");
                lastApp = app;
                // TODO: loadApp not reload when in the same app
                // if (app == 'casino') {
                //   loadApp(app);
                //   window.location.href = window.location.href;
                // } else {
                //   window.location.href = window.location.href;
                // }
                window.location.reload();
                break;
            }
        case "reload":
            {
                window.location.reload();
                break;
            }
        case "redirect":
            {
                document.location.href = event.data.payload.url;
                break;
            }
        case "redirect-path":
            {
                window.parent.postMessage({
                    action: "redirect",
                    payload: event.data.payload
                }, "*");
                break;
            }
        case "app-login":
            {
                const {
                    username,
                    password
                } = event.data.payload;
                if (!username || !password) {
                    new_notification({
                        type: "error",
                        time: 5000,
                        msg1: "missing_credentials",
                    });
                    break;
                }
                if (domainConfigs.ltd) {
                    event.data.payload.ltd = domainConfigs.ltd;
                }
                if (domainConfigs.shard) {
                    event.data.payload.shard = domainConfigs.shard;
                }
                if (domainConfigs.part) {
                    event.data.payload.part = domainConfigs.part;
                }
                if (haUrl) {
                    event.data.payload.haUrl = haUrl;
                }

                window.parent.postMessage({
                        action: "login",
                        payload: event.data.payload,
                    },
                    "*"
                );
                break;
            }
        case "app-logout":
            {
                const payload = {
                    haUrl,
                };
                if (domainConfigs.shard) {
                    payload.shard = domainConfigs.shard;
                }
                if (domainConfigs.part) {
                    payload.part = domainConfigs.part;
                }
                window.parent.postMessage({
                    action: "logout",
                    payload
                }, "*");
                break;
            }
        case "get-tickets":
            {
                const {
                    start_date,
                    end_date,
                    currency,
                    start,
                    rows,
                    ticketCode,
                    ticketType,
                    ticketBonus,
                    ticketSelections,
                    ticketState
                } = event.data.payload;
                const ticketArr = [];
                let totalRows = 0;
                const ticketsAggregate = {};

                let method = ".in?action=get&subaction=tickets&view=tickets";
                method += "&start_date=" + start_date;
                method += "&end_date=" + end_date;
                method += "&currency=" + currency;
                method += "&start=" + start;
                method += "&rows=" + rows;
                method += "&order=time&direction=desc";
                if (ticketCode && ticketCode !== "") {
                    method += "&nr=" + ticketCode;
                }
                if (ticketType && ticketType !== "" && ticketType !== "all") {
                    method += "&type=" + ticketType;
                }
                if (ticketBonus && ticketBonus !== "" && ticketBonus !== "all") {
                    method += "&bonus=" + ticketBonus;
                }
                if (ticketSelections && ticketSelections !== "" && ticketSelections !== "all") {
                    method += "&selections=" + ticketSelections;
                }
                if (ticketState && ticketState !== "" && ticketState !== "all") {
                    method += "&state=" + ticketState;
                }

                const ticketsPromise = platformApiCall(method, "json", {}, "api", "json", 1, (data) => {
                    if (data.data) {
                        data.data.forEach((t) => {
                            const ticket = {};
                            t.forEach((v, i) => {
                                if (data.schema[i] === "time") {
                                    ticket[data.schema[i]] = window.moment(v * 1000).format("L, HH:mm");
                                } else if (data.schema[i] === "raundi") {
                                    ticket[data.schema[i]] = (v + "").substr(-3);
                                } else if (data.schema[i] === "ops") {
                                    ticket[data.schema[i]] = v.split("#")[1];
                                } else {
                                    ticket[data.schema[i]] = v;
                                }
                            });
                            ticketArr.push(ticket);
                        });
                        totalRows = data.total_size;
                    }
                });

                method = ".in?action=get&subaction=tickets&view=self";
                method += "&start_date=" + start_date;
                method += "&end_date=" + end_date;
                method += "&currency=" + currency;
                const selfPromise = platformApiCall(method, "json", {}, "api", "json", 1, (data) => {
                    if (data.data) {
                        data.data[0].forEach((v, i) => {
                            ticketsAggregate[data.schema[i]] = v;
                        });
                    }
                });

                Promise.all([ticketsPromise, selfPromise]).then(() => {
                    const data = {
                        action: "get-tickets",
                        payload: {
                            ticketsData: ticketArr,
                            totalRows,
                            ticketsAggregate
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                });
                break;
            }
        case "get-tickets-details":
            {
                const {
                    ticketId,
                    print
                } = event.data.payload;
                let method = ".in?action=get&subaction=ticket";
                method += "&ticket_id=" + ticketId;
                await platformApiCall(method, "json", {}, "api", "json", 1, async (_data) => {
                    const {
                        ticketHeader,
                        ticketLines
                    } = await buildTicketDetails(_data.data.ticket_data, _data.schema.ticket_header, _data.data.ticket_lines, _data.schema.lines_header);
                    if (print && window.ticketStore && window.ticketStore.byId) {
                        delete window.ticketStore.byId[ticketId];
                    }
                    window.tempTicketLines = ticketLines;
                    const data = {
                        action: "get-tickets-details",
                        payload: {
                            ticketHeader,
                            ticketLines
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                });
                break;
            }
        case "get-match-results":
            {
                let {
                    matchId
                } = event.data.payload;
                let method = `.in?action=result&match_id=${matchId}`;
                await platformApiCall(method, "json", {}, "api", "json", 1, (resp) => {
                    if (!resp.Error) {
                        const matchResult = {};
                        if (resp.data) {
                            matchResult.data = [];
                            resp.data.forEach((rez) => {
                                var o = {};
                                rez.forEach((x, i) => {
                                    o[resp.schema[i]] = x;
                                });
                                matchResult.data.push(o);
                            });
                        }
                        if (resp.data_live) {
                            matchResult.data_live = [];
                            resp.data_live.forEach((rez) => {
                                var o = {};
                                rez.forEach((x, i) => {
                                    o[resp.schema[i]] = x;
                                });
                                matchResult.data_live.push(o);
                            });
                        }
                        var data = {
                            action: "get-match-results",
                            payload: {
                                matchResult
                            },
                        };
                        for (var i = 0; i < window.frames.length; i++) {
                            window.frames[i].postMessage(data, "*");
                        }
                    } else {
                        new_notification({
                            type: "error",
                            time: 5000,
                            msg1: resp.Message,
                        });
                    }
                });
                break;
            }
        case "search-ticket":
            {
                const {
                    ticketNr,
                    ticketCode
                } = event.data.payload;
                if (ticketCode) {
                    const data = event.data.payload;
                    if (haUrl) data.haUrl = haUrl;
                    window.parent.postMessage({
                            action: "search-ticket-api",
                            payload: data,
                        },
                        "*"
                    );
                    return;
                }
                let method = ".in?action=get&subaction=search_ticket";
                if (Number.isNaN(ticketNr * 1)) {
                    method += "&ticket_name=" + ticketNr;
                } else {
                    method += "&ticket_id=" + ticketNr;
                }

                const response = await platformApiCall(method, "json", {}, "api", "json", 1);
                const {
                    data,
                    schema,
                    Error,
                    Message = ""
                } = response;
                if (Error) {
                    const dataS = {
                        action: "get-tickets-details",
                        payload: {
                            Error: true
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(dataS, "*");
                    }
                    new_notification({
                        time: 5000,
                        msg1: Message,
                    });
                    return;
                }
                const {
                    ticketHeader,
                    ticketLines
                } = await buildTicketDetails(data.ticket_data, schema.ticket_header, data.ticket_lines, schema.lines_header);
                const out = {
                    action: "get-tickets-details",
                    payload: {
                        ticketHeader,
                        ticketLines
                    },
                };
                for (let i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage(out, "*");
                }
                break;
            }
        case "search-ticket-response":
            {
                const {
                    data,
                    schema,
                    Error,
                    Message = ""
                } = event.data.payload;
                if (Error) {
                    const dataS = {
                        action: "get-tickets-details",
                        payload: {
                            Error: true
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(dataS, "*");
                    }
                    new_notification({
                        time: 5000,
                        msg1: Message,
                    });
                    return;
                }
                const {
                    ticketHeader,
                    ticketLines
                } = await buildTicketDetails(data.ticket_data, schema.ticket_header, data.ticket_lines, schema.lines_header);
                const out = {
                    action: "get-tickets-details",
                    payload: {
                        ticketHeader,
                        ticketLines
                    },
                };
                for (let i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage(out, "*");
                }

                break;
            }
        case "cancel-ticket":
            {
                const {
                    ticketId,
                    payCode
                } = event.data.payload;
                let method = ".in?action=set&subaction=cancel_ticket";
                method += "&ticket_id=" + ticketId;
                if (payCode) {
                    method += "&pay_code=" + payCode;
                }
                await platformApiCall(method, "json", {}, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            time: 5000,
                            msg1: "ticket_canceled_successful",
                        });
                        window.postMessage({
                                action: "get-tickets-details",
                                payload: {
                                    ticketId: ticketId,
                                },
                            },
                            "*"
                        );
                    } else {
                        new_notification({
                            type: "error",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "pay-ticket":
            {
                const {
                    ticketId,
                    payCode,
                    userInfo
                } = event.data.payload;
                let method = ".in?action=set&subaction=pay_ticket";
                method += "&ticket_id=" + ticketId;
                if (payCode) {
                    method += "&pay_code=" + payCode;
                }
                if (userInfo) {
                    for (let info in userInfo) {
                        if (userInfo.hasOwnProperty(info)) method += `&${info}=${userInfo[info]}`;
                    }
                }
                await platformApiCall(method, "json", {}, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            time: 5000,
                            msg1: "ticket_paid_successful",
                        });
                        window.postMessage({
                                action: "get-tickets-details",
                                payload: {
                                    ticketId: ticketId,
                                },
                            },
                            "*"
                        );
                    } else {
                        new_notification({
                            type: "error",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "pay-jackpot":
            {
                const {
                    ticketId,
                    payCode
                } = event.data.payload;
                let method = `.in?action=set&subaction=pay_jackpot&ticket_id=${ticketId}&pay_code=${payCode}`;

                await platformApiCall(method, "json", {}, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            time: 5000,
                            msg1: "jackpot_paid_successful",
                        });
                    } else {
                        new_notification({
                            type: "error",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "get-statement":
            {
                Promise.all([get_account_categories(), get_statement_self(event.data.payload)]).then(() => {
                    const accStatementObj = {};
                    tempAccountStatement.data.forEach((d) => {
                        accStatementObj[d[0]] = {
                            c: d[1] * 1,
                            a: d[2] * 1,
                        };
                    });
                    const statementData = [];
                    tempAccountCategs.forEach((categ) => {
                        var totA = 0;
                        var totC = 0;
                        let subCategArr = [];
                        categ.v.forEach((subCateg) => {
                            var stA = 0;
                            var stC = 0;
                            subCateg.v.forEach((trxId) => {
                                if (accStatementObj[trxId]) {
                                    stA += accStatementObj[trxId].a;
                                    stC += accStatementObj[trxId].c;
                                }
                            });
                            var subCategStore = {
                                subCategName: subCateg.k,
                                total: {
                                    amount: stA,
                                    cnt: stC,
                                },
                                trxIds: subCateg.v,
                            };
                            totA += stA;
                            totC += stC;
                            subCategArr.push(subCategStore);
                        });
                        var catObj = {
                            categName: categ.k,
                            total: {
                                amount: totA,
                                cnt: totC,
                            },
                            subCategs: subCategArr,
                        };
                        statementData.push(catObj);
                    });
                    var data = {
                        action: "get-statement",
                        payload: {
                            statementData
                        },
                    };
                    for (var i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                    tempAccountCategs = [];
                    tempAccountStatement = {};
                });
                break;
            }
        case "get-statement-details":
            {
                const {
                    start_date,
                    end_date,
                    currency,
                    types,
                    start,
                    rows
                } = event.data.payload;
                let method = ".in?action=get&subaction=account_report&view=transactions";
                method += "&start_date=" + start_date;
                method += "&end_date=" + end_date;
                method += "&currency=" + currency;
                method += "&start=" + start;
                method += "&rows=" + rows;
                method += "&type[]=" + types.join("&type[]=");
                await platformApiCall(method, "json", {}, "api", "json", 1, (data) => {
                    if (data.Error) {
                        alert(data.Message);
                    } else {
                        const statementDetails = [];
                        data.data.forEach((tr) => {
                            const stObj = {};
                            tr.forEach((v, i) => {
                                if (data.schema[i] === "time") {
                                    stObj[data.schema[i]] = window.moment(v * 1000).format("L, HH:mm");
                                } else {
                                    stObj[data.schema[i]] = v;
                                }
                            });
                            statementDetails.push(stObj);
                        });
                        const out = {
                            action: "get-statement-details",
                            payload: {
                                statementDetails: statementDetails,
                                totalRows: data.total_size,
                            },
                        };
                        for (let i = 0; i < window.frames.length; i++) {
                            window.frames[i].postMessage(out, "*");
                        }
                    }
                });
                break;
            }
        case "load_casino_new":
            {
                let skin_path = "";
                if (window.domainConfigs["skin_path"]) {
                    skin_path += "&skin_path=" + window.domainConfigs["skin_path"];
                }
                const home_path = "&home_path=" + window.location.href.split("#from_other").join("");
                let username = "nologin";
                if (userStore && userStore.parameters && userStore.parameters.username) {
                    username = userStore.parameters.username;
                }
                window.location.href = "http://srv1.front-web.net/games/btob-casino/?username=" + username + "&API_Access_Token=" + window.API_Access_Token + skin_path + home_path;
                break;
            }
        case "change-timezone":
            {
                let {
                    tz
                } = event.data.payload;
                let method = ".in?action=set_timezone&timezone=" + encodeURIComponent(tz);
                await platformApiCall(method, "json", {}, "api", "json", 2, () => {
                    document.location.reload();
                });
                break;
            }
        case "charge-voucher":
            {
                let {
                    voucher,
                    voucher_type
                } = event.data.payload;
                let method = ".in?action=set&subaction=consume_voucher";
                const formData = new FormData();
                formData.append("voucher", voucher);
                formData.append("voucher_type", voucher_type);
                await platformApiCall(method, "formData", formData, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            notif_for: "consume_voucher",
                            time: 5000,
                            msg1: "voucher_charged",
                        });
                    } else {
                        new_notification({
                            type: "error",
                            notif_for: "consume_voucher",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "withdraw-voucher":
            {
                let {
                    voucher_type,
                    currency,
                    value
                } = event.data.payload;
                let method = ".in?action=set&subaction=produce_voucher";
                const {
                    Error,
                    Message: hash
                } = await getReqHash(method);
                if (Error) {
                    return new_notification({
                        type: "error",
                        notif_for: "produce_voucher",
                        time: 5000,
                        msg1: "withdraw_voucher_request_fail",
                    });
                }
                method += `&request=${hash}`;
                const formData = new FormData();
                formData.append("voucher_type", voucher_type);
                formData.append("currency", currency);
                formData.append("value", value);
                await platformApiCall(method, "formData", formData, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        const dataToSend = {
                            action: "withdraw-voucher",
                            payload: data,
                        };
                        for (let i = 0; i < window.frames.length; i++) {
                            window.frames[i].postMessage(dataToSend, "*");
                        }
                        new_notification({
                            type: "success",
                            notif_for: "produce_voucher",
                            time: 5000,
                            msg1: "voucher_produced",
                        });
                    } else {
                        new_notification({
                            type: "error",
                            notif_for: "produce_voucher",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "consume-voucher":
            {
                let {
                    voucher,
                    voucher_type
                } = event.data.payload;
                let method = `.in?action=set&subaction=consume_voucher`;
                const formData = new FormData();
                formData.append("voucher", voucher);
                formData.append("voucher_type", voucher_type);
                await platformApiCall(method, "formData", formData, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            notif_for: "consume_voucher",
                            time: 5000,
                            msg1: "voucher_charged",
                        });
                    } else {
                        new_notification({
                            type: "error",
                            notif_for: "consume_voucher",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "get-vouchers-list":
            {
                // let { voucher_type } = event.data.payload;
                let method = `.in?action=get&subaction=vouchers&voucher_type=4`;
                await platformApiCall(method, "json", {}, "api", "json", 1, (data) => {
                    const dataToSend = {
                        action: "get-vouchers-list",
                        payload: data,
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(dataToSend, "*");
                    }
                });
                break;
            }
        case "change-password":
            {
                const {
                    old_pass,
                    new_pass,
                    confirm_new
                } = event.data.payload;
                let method = ".in?action=change_pass";
                const formData = new FormData();
                formData.append("old_pass", old_pass);
                formData.append("new_pass", new_pass);
                formData.append("confirm_new", confirm_new);
                await platformApiCall(method, "formData", formData, "api", "json", 2, (data) => {
                    if (!data.Error && data.Message === "Ok") {
                        new_notification({
                            type: "success",
                            notif_for: "change_pass",
                            time: 5000,
                            msg1: "password_changed",
                        });
                    } else {
                        new_notification({
                            type: "error",
                            notif_for: "change_pass",
                            time: 5000,
                            msg1: data.Message,
                        });
                    }
                });
                break;
            }
        case "load-chat":
            {
                if (domainConfigs["livechatinc"]) {
                    loadLiveChat(1);
                } else if (domainConfigs["tawk_chat"]) {
                    // < !--Start of Tawk.to Script-- >

                    window.Tawk_API = window.Tawk_API || {};
                    window.Tawk_LoadStart = new Date();
                    (function() {
                        const s1 = document.createElement("script"),
                            s0 = document.getElementsByTagName("script")[0];
                        s1.async = true;
                        // s1.src = "https://embed.tawk.to/5f8af419fd4ff5477ea6b369/default";
                        s1.src = domainConfigs["tawk_chat"];
                        s1.charset = "UTF-8";
                        s1.setAttribute("crossorigin", "*");
                        s0.parentNode.insertBefore(s1, s0);
                    })();
                    // < !--End of Tawk.to Script-- >
                }
                break;
            }
        case "get-funds":
            {
                const {
                    currId
                } = event.data ? .payload || {};
                await getFunds(currId);
                break;
            }
        case "get-hash-lmt":
            {
                if (auth_hash) {
                    const data = {
                        action: "get-hash-lmt",
                        payload: {
                            hash: auth_hash
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                    break;
                }
                if (userStore.username === "nologin") {
                    const hash = "ok~c38eab71691b4306faefaf336a3cec7833c605bd5c27d78761b9421431a44fce~7258114801";
                    const data = {
                        action: "get-hash-lmt",
                        payload: {
                            hash
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                    break;
                }
                const hash = await platformApiCall(".in?action=auth_socket&username=" + userStore.parameters.username, "text", {}, "api", "text", 1);
                if (hash.split("~")[0] === "ok") {
                    auth_hash = hash;
                    const data = {
                        action: "get-hash-lmt",
                        payload: {
                            hash: auth_hash
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(data, "*");
                    }
                }
                break;
            }
        case "get-hash-keno-bkmk":
            {
                if (auth_hash) {
                    const out = {
                        action: "get-hash-keno-bkmk",
                        payload: {
                            hash: auth_hash
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(out, "*");
                    }
                } else {
                    platformApiCall(".in?action=auth_socket&username=" + userStore.parameters.username, "text", {}, "api", "text", 1, (_data) => {
                        auth_hash = _data;
                        var data = {
                            action: "get-hash-keno-bkmk",
                            payload: {
                                hash: auth_hash
                            },
                        };
                        for (var i = 0; i < window.frames.length; i++) {
                            window.frames[i].postMessage(data, "*");
                        }
                    });
                }
                break;
            }
        case "get-hash-dgs":
            {
                if (auth_hash) {
                    const out = {
                        action: "get-hash-dgs",
                        payload: {
                            hash: auth_hash
                        },
                    };
                    for (let i = 0; i < window.frames.length; i++) {
                        window.frames[i].postMessage(out, "*");
                    }
                } else {
                    platformApiCall(".in?action=auth_socket&username=" + userStore.parameters.username, "text", {}, "api", "text", 1, (_data) => {
                        auth_hash = _data;
                        const out = {
                            action: "get-dgs",
                            payload: {
                                hash: auth_hash
                            },
                        };
                        for (let i = 0; i < window.frames.length; i++) {
                            window.frames[i].postMessage(out, "*");
                        }
                    });
                }
                break;
            }
        case "loadCasino":
            {
                sessionStorage.lastAppView = "casino";
                loadApp("casino");
                break;
            }
        case "new-notification":
            {
                new_notification(event.data.payload);
                break;
            }
        case "printPost":
            {
                window.parent.postMessage({
                    action: "printPost",
                    payload: event.data.payload
                }, "*");
                break;
            }
        case "request-withdraw":
            {
                const data = event.data.payload;
                if (domainConfigs["shard"] && domainConfigs["part"]) {
                    data["stoken"] = await getToken("s");
                } else {
                    data["token"] = API_Access_Token;
                }
                const res = await requestWithdraw(data);
                if (res.error) {
                    new_notification({
                        type: "error",
                        time: 5000,
                        msg1: res.message,
                    });
                    return;
                }
                new_notification({
                    type: "success",
                    time: 5000,
                    msg1: res.message,
                });
                break;
            }
        case "get-user-info":
            {
                if (!lToken && !API_Access_Token) {
                    break;
                }
                let method = ".in?action=get&subaction=user_info";
                const dataToSend = {
                    username: userStore.username,
                    domain: window.domain
                };
                let userInfo = (await platformApiCall(method, "json", dataToSend, "api", "json", 1)) || {};

                let tokenS = `token=${API_Access_Token}`;
                if (domainConfigs["shard"] && domainConfigs["part"]) {
                    tokenS = `ltoken=${lToken}`;
                }
                const url = `https://srv2.${window.domain}/cw/cu/get/user_info?${tokenS}&username=${userStore.username}`;
                // const url = `https://srv2.kits-test.net/cw/cu/get/user_info?${tokenS}&username=${userStore.username}`;
                // const url = `http://srv2.front-web.net/cw/withdraw/set/init`;
                const uinfo = await fetch(url, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    })
                    .then((response) => response.json())
                    .then((res) => {
                        if (res.error) {
                            throw Error;
                        }
                        return res;
                    })
                    .catch((error) => {
                        console.log(error);
                    });
                userInfo = { ...userInfo,
                    ...uinfo
                };
                for (let i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage({
                        action: "get-user-info-response",
                        payload: {
                            userInfo
                        }
                    }, "*");
                }
                break;
            }
        case "change-user-info":
            {
                const data = event.data.payload;
                data.username = userStore.username;
                if (domainConfigs["shard"] && domainConfigs["part"]) {
                    data["stoken"] = await getToken("s");
                } else {
                    data["token"] = API_Access_Token;
                }
                const url = `https://srv2.${window.domain}/cw/cu/set/change_info`;
                // const url = `http://srv2.front-web.net/cw/withdraw/set/init`;
                fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(data),
                })
                .then((response) => response.json())
                .then((res) => {
                    if (res.error) {
                        throw Error;
                    }
                    new_notification({
                        type: "success",
                        time: 5000,
                        msg1: res.message,
                    });
                })
                .catch(() => {
                    new_notification({
                        type: "error",
                        time: 5000,
                        msg1: "change_user_info_failed",
                    });
                });
                break;
            }
        case "recover-password":
            {
                const data = event.data.payload;
                await resetPassword(data);
                break;
            }
        case "get-token":
            {
                const {
                    type
                } = event.data.payload;
                const token = await getToken(type === "short" ? "s" : "l");
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage(token);
                }
                break;
            }
        case "get-jackpot":
            {
                const {
                    model
                } = event.data.payload;
                const response = await asyncPM({
                    action: "get-jackpot",
                    payload: {
                        model,
                        haUrl
                    }
                });
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage(response);
                }
                return;
            }
        case "get-jackpot-winners":
            {
                let method = ".in?action=get&subaction=jackpot_winners";
                const response = await platformApiCall(method, "json", {}, "api", "json", 1);
                const data = Object.keys(response).map((id) => ({
                    id,
                    ...response[id]
                }));
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage(data);
                }
                break;
            }
        default:
    }
});

// startFMC();

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

async function asyncPM(data) {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = ({
            data
        }) => {
            channel.port1.close();
            resolve(data);
        };
        window.parent.postMessage(data, "*", [channel.port2]);
    });
}

function mobileAndTabletcheck() {
    let check = false;
    ((a) => {
        if (
            /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
                a
            ) ||
            /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
                a.substr(0, 4)
            )
        ) {
            check = true;
        }
    })(navigator.userAgent || navigator.vendor || $(window)["opera"]);
    if (document.body.offsetWidth < 1000) {
        check = true;
    }
    return check;
}

window.userStore = userStore;
window.new_notification = new_notification;
window.auth_hash = auth_hash;
window.platformApiCall = platformApiCall;
window.arraysEqual = arraysEqual;
window.getCasinoGroups = getCasinoGroups;
window.API_Access_Token = API_Access_Token;
window.asyncPM = asyncPM;
window.mobileAndTabletcheck = mobileAndTabletcheck;
// window.tempStore = tempStore;
// window.tempStoreLive = tempStoreLive;

// helper functions

// start app
window.parent.postMessage({
    action: "app-init"
}, "*");