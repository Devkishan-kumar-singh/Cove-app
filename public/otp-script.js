// =========================================
// OTP VERIFICATION — FULL HANDLER
// =========================================

const inputs = Array.from(document.querySelectorAll(".otp-inputs input"));
const resendLink = document.getElementById("resend");
const resendTimerEl = document.getElementById("resendTimer");
const verifyBtn = document.getElementById("verifyBtn");
const btnText = verifyBtn.querySelector(".btn-text");
const btnSpinner = verifyBtn.querySelector(".btn-spinner");
const statusMsg = document.getElementById("statusMsg");
const emailDisplay = document.getElementById("emailDisplay");

const API_BASE = ""; // same-origin: works when Express serves /public

const RESEND_COOLDOWN_SECONDS = 30;
let resendTimerInterval = null;

// ---- which flow is this? registration OTP, or "login with OTP"? ----
const params = new URLSearchParams(window.location.search);
const isLoginFlow = params.get("flow") === "login";

const storageKey = isLoginFlow ? "loginEmail" : "pendingEmail";
const verifyEndpoint = isLoginFlow ? "/api/login/verify-otp" : "/api/verify-otp";
const resendEndpoint = isLoginFlow ? "/api/login/request-otp" : "/api/resend-otp";
const landingPage = isLoginFlow ? "login.html" : "register.html";

// ---- who are we verifying? ----
const email = sessionStorage.getItem(storageKey);

if (!email) {
    // Nobody in this flow this session — send them back.
    window.location.href = landingPage;
} else {
    emailDisplay.textContent = email;
}

const backLink = document.getElementById("backLink");
if (backLink && isLoginFlow) {
    backLink.href = "login.html";
    backLink.textContent = "\u2190 Back to log in";
}

// =========================================
// STATUS HELPERS
// =========================================

function setStatus(message, type = "") {
    statusMsg.textContent = message;
    statusMsg.className = "status-msg" + (type ? ` ${type}` : "");
}

function setVerifyLoading(isLoading) {
    verifyBtn.disabled = isLoading;
    btnSpinner.hidden = !isLoading;
    btnText.textContent = isLoading ? "Verifying..." : "Verify";
}

function markInvalid(invalid) {
    inputs.forEach((input) => input.classList.toggle("invalid", invalid));
}

function getOtpValue() {
    return inputs.map((i) => i.value).join("");
}

function clearOtpInputs() {
    inputs.forEach((i) => (i.value = ""));
    inputs[0].focus();
}

// =========================================
// INPUT BEHAVIOUR: auto-advance, backspace, paste
// =========================================

inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
        input.classList.toggle("filled", input.value.length === 1);
        markInvalid(false);
        setStatus("");

        if (input.value.length === 1 && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }

        if (getOtpValue().length === inputs.length) {
            handleVerify();
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && input.value === "" && index > 0) {
            inputs[index - 1].focus();
        }
        if (e.key === "ArrowLeft" && index > 0) {
            inputs[index - 1].focus();
        }
        if (e.key === "ArrowRight" && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    });

    input.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
            .getData("text")
            .replace(/[^0-9]/g, "")
            .slice(0, inputs.length);

        if (!pasted) return;

        pasted.split("").forEach((digit, i) => {
            if (inputs[i]) {
                inputs[i].value = digit;
                inputs[i].classList.add("filled");
            }
        });

        const nextEmpty = inputs.findIndex((i) => i.value === "");
        (nextEmpty === -1 ? inputs[inputs.length - 1] : inputs[nextEmpty]).focus();

        if (getOtpValue().length === inputs.length) {
            handleVerify();
        }
    });
});

// =========================================
// VERIFY
// =========================================

async function handleVerify() {
    const otp = getOtpValue();

    if (otp.length !== inputs.length) {
        setStatus("Enter all 6 digits.", "error");
        markInvalid(true);
        return;
    }

    setVerifyLoading(true);
    setStatus("");
    markInvalid(false);

    try {
        const res = await fetch(`${API_BASE}${verifyEndpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            markInvalid(true);
            setStatus(data.message || "Incorrect or expired code.", "error");
            setVerifyLoading(false);
            return;
        }

        setStatus(isLoginFlow ? "Logged in! Redirecting..." : "Verified! Redirecting...", "success");
        sessionStorage.removeItem("pendingEmail");
        sessionStorage.removeItem("pendingName");
        sessionStorage.removeItem("loginEmail");

        if (data.token) {
            localStorage.setItem("coveToken", data.token);
            if (data.user) localStorage.setItem("coveUser", JSON.stringify(data.user));
        }

        setTimeout(() => {
            window.location.href = "chat.html";
        }, 1200);
    } catch (err) {
        setStatus("Could not reach the server. Is it running?", "error");
        setVerifyLoading(false);
    }
}

verifyBtn.addEventListener("click", handleVerify);

// =========================================
// RESEND
// =========================================

function startResendCooldown() {
    let remaining = RESEND_COOLDOWN_SECONDS;
    resendLink.classList.add("disabled");
    resendTimerEl.textContent = `(${remaining}s)`;

    resendTimerInterval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(resendTimerInterval);
            resendLink.classList.remove("disabled");
            resendTimerEl.textContent = "";
        } else {
            resendTimerEl.textContent = `(${remaining}s)`;
        }
    }, 1000);
}

resendLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (resendLink.classList.contains("disabled")) return;

    setStatus("Sending a new code...", "info");

    try {
        const res = await fetch(`${API_BASE}${resendEndpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            setStatus(data.message || "Couldn't resend right now.", "error");
            return;
        }

        clearOtpInputs();
        setStatus("A new code has been sent to your email.", "success");
        startResendCooldown();
    } catch (err) {
        setStatus("Could not reach the server. Is it running?", "error");
    }
});

// Kick off the cooldown immediately since a code was just sent.
startResendCooldown();
inputs[0].focus();
