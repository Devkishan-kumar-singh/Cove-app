// =========================================
// LOGIN — password mode + OTP mode
// =========================================

const API_BASE = "";

const form = document.getElementById("loginForm");
const banner = document.getElementById("loginBanner");
const submitBtn = document.getElementById("loginSubmitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const btnSpinner = submitBtn.querySelector(".btn-spinner");
const toggleModeLink = document.getElementById("toggleModeLink");

const passwordFields = document.getElementById("passwordFields");
const otpFields = document.getElementById("otpFields");

const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const otpEmailInput = document.getElementById("otpEmail");

let mode = "password"; // "password" | "otp"

function clearErrors() {
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    banner.textContent = "";
    banner.classList.remove("show", "error-banner");
}

function setError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function showBanner(message, isError = false) {
    banner.textContent = message;
    banner.classList.add("show");
    banner.classList.toggle("error-banner", isError);
}

function setLoading(isLoading, loadingLabel) {
    submitBtn.disabled = isLoading;
    btnSpinner.hidden = !isLoading;
    btnText.textContent = isLoading ? loadingLabel : mode === "password" ? "Log in" : "Send code";
}

toggleModeLink.addEventListener("click", (e) => {
    e.preventDefault();
    clearErrors();

    if (mode === "password") {
        mode = "otp";
        passwordFields.hidden = true;
        otpFields.hidden = false;
        otpEmailInput.value = loginEmailInput.value;
        btnText.textContent = "Send code";
        toggleModeLink.textContent = "Log in with a password instead";
    } else {
        mode = "password";
        otpFields.hidden = true;
        passwordFields.hidden = false;
        loginEmailInput.value = otpEmailInput.value;
        btnText.textContent = "Log in";
        toggleModeLink.textContent = "Log in with a one-time code instead";
    }
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    if (mode === "password") {
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;
        let valid = true;

        if (!emailPattern.test(email)) {
            setError("loginEmailError", "Enter a valid email address.");
            valid = false;
        }
        if (!password) {
            setError("loginPasswordError", "Password is required.");
            valid = false;
        }
        if (!valid) return;

        setLoading(true, "Logging in...");

        try {
            const res = await fetch(`${API_BASE}/api/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                showBanner(data.message || "Login failed.", true);
                setLoading(false);
                return;
            }

            showBanner(`Welcome back, ${data.user?.name || ""}!`);
            if (data.token) {
                localStorage.setItem("coveToken", data.token);
                if (data.user) localStorage.setItem("coveUser", JSON.stringify(data.user));
            }
            setTimeout(() => {
                window.location.href = "chat.html";
            }, 900);
        } catch (err) {
            showBanner("Could not reach the server. Is it running?", true);
            setLoading(false);
        }
    } else {
        const email = otpEmailInput.value.trim();

        if (!emailPattern.test(email)) {
            setError("otpEmailError", "Enter a valid email address.");
            return;
        }

        setLoading(true, "Sending code...");

        try {
            const res = await fetch(`${API_BASE}/api/login/request-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                showBanner(data.message || "Could not send code.", true);
                setLoading(false);
                return;
            }

            sessionStorage.setItem("loginEmail", email);
            showBanner("Code sent! Redirecting...");
            setTimeout(() => {
                window.location.href = "otp.html?flow=login";
            }, 800);
        } catch (err) {
            showBanner("Could not reach the server. Is it running?", true);
            setLoading(false);
        }
    }
});

form.addEventListener("input", (e) => {
    const id = e.target.id;
    if (id) {
        const errorEl = document.getElementById(id + "Error");
        if (errorEl) errorEl.textContent = "";
    }
});
