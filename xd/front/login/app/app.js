var domainConfigs = {};

window.onload = function() {
    $(".input100").each(function() {
        $(this).on("blur", function() {
            if ($(this).val().trim() !== "") {
                $(this).addClass("has-val");
            } else {
                $(this).removeClass("has-val");
            }
        });
        $(this).on("keyup", function() {
            if ($("#username").val() !== "") {
                $("#username_error").addClass("hidden");
            }
            if ($("#password").val() !== "") {
                $("#password_error").addClass("hidden");
            }
            if (!$("#container-sign-up").hasClass("hidden") && $(this).val() !== "") {
                if (!$("#required_error").hasClass("hidden")) {
                    $("#required_error").addClass("hidden");
                }
            }
        });
    });
    $("#username").focus();
    window.addEventListener("message", async (event) => {
        switch (event.data.action) {
            case "app-init":
                {
                    const {
                        facePath,
                        domain
                    } = event.data.payload;
                    domainConfigs = await getDomainConfigs(facePath, domain);
                    if (domainConfigs.skin_path) {
                        const {
                            skin_path,
                            skin_rev
                        } = domainConfigs;
                        loadCustomSkin(skin_path, skin_rev);
                    }
                    if (domainConfigs.shard && domainConfigs.part) {
                        $('.saveDevContainer').show();
                    }
                    $("#app-loading-container").addClass("hide-loading");
                    break;
                }
            default:
                break;
        }
    });
    // start app
    window.parent.postMessage({
        action: "app-init"
    }, "*");
};

const getDomainConfigs = (facePath, domain) => {
    const configs = {};
    return fetch(`${facePath}cnf/current/${domain}/cnf.txt`)
        .then((response) => {
            if (response.status !== 200) {
                console.log("Error reading file. Status Code: " + response.status);
                return configs;
            }
            return response.text().then((data) => {
                data.split("\n").forEach(function(param) {
                    param = param.split("=");
                    if (param.length == 2 && param[0] !== "" && param[1] !== "") {
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

function loadCustomSkin(skin_path, skin_rev) {
    skin_rev = skin_rev ? `?r=${skin_rev}` : "";
    var head = document.getElementsByTagName("head")[0];
    var link = document.createElement("link");
    link.id = "customCss";
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = `../face/${skin_path}/skin.css${skin_rev}`;
    link.media = "all";
    link.onload = function() {
        $("#app-loading-container").addClass("hide-loading");
    };
    link.onerror = function() {
        $("#app-loading-container").addClass("hide-loading");
    };
    head.appendChild(link);
}

function login(event) {
    if (event === "mouse" || event.keyCode === 13 || event.which === 13) {
        $("#app-loading-container").removeClass("hide-loading");
        if (validateLogin()) {
            const u = $("#username").val();
            const p = $("#password").val();
            const saveDevice = document.getElementById('saveDevice').checked;
            const data = {
                username: u,
                password: p,
                saveDevice
            };
            setTimeout(() => {
                if (domainConfigs.ltd) {
                    data.ltd = domainConfigs.ltd;
                }
                if (domainConfigs.haUrl) {
                    let haUrl = domainConfigs.haUrl;
                    if (haUrl.slice(-1) !== "/") {
                        haUrl += "/";
                    }
                    data.haUrl = haUrl;
                }
                if (domainConfigs.shard && domainConfigs.part) {
                    data.shard = domainConfigs.shard;
                    data.part = domainConfigs.part;
                }
                window.parent.postMessage({
                        action: "login",
                        payload: data,
                    },
                    "*"
                );
                $("#app-loading-container").addClass("hide-loading");
            }, 1);
        } else {
            $("#app-loading-container").addClass("hide-loading");
        }
    }
}

function showSignUpForm() {
    $(".wrap-login100").addClass("hidden");
    $(".container-sign-up").removeClass("hidden");
}

function validateLogin() {
    let valid = true;
    if ($("#username").val() === "") {
        $("#username_error").removeClass("hidden");
        valid = false;
    }
    if ($("#password").val() === "") {
        $("#password_error").removeClass("hidden");
        valid = false;
    }
    return valid;
}

function showLoginForm() {
    $("#required_error").addClass("hidden");
    $(".label-input100").css("color", "#ffffff");
    $(".container-sign-up").addClass("hidden");
    $(".wrap-login100").removeClass("hidden");
}

function sign_up() {
    let valid = true;
    $(".input100").each(function() {
        if ($(this).val() === "") {
            valid = false;
            $(this).parent().parent().children().eq(0).css("color", "#ff9393");
            $("#required_error").removeClass("hidden");
        }
    });
    return valid;
}