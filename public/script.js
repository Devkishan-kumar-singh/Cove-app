// =========================================
// REGISTRATION FORM VALIDATION + OTP HANDOFF
// =========================================

const form = document.getElementById("regForm");
const successMsg = document.getElementById("formSuccess");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const btnSpinner = submitBtn.querySelector(".btn-spinner");

const nameInput = document.getElementById("name");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const countrySelect = document.getElementById("country");
const messageInput = document.getElementById("message");

// Point this at wherever your backend actually runs.
// If you serve /public from the same Express app (see server.js),
// a relative path just works.
const API_BASE = "";

let usernameAvailable = null; // null = unchecked, true/false = known
let usernameCheckTimer = null;

usernameInput.addEventListener("input", () => {
    const val = usernameInput.value.trim();
    usernameAvailable = null;
    clearTimeout(usernameCheckTimer);

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) {
        setError("usernameError", val ? "3-20 characters: letters, numbers, underscores only." : "");
        return;
    }

    usernameCheckTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/check-username`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: val }),
            });
            const data = await res.json();
            usernameAvailable = !!data.available;
            setError("usernameError", usernameAvailable ? "" : "That username is taken.");
        } catch (err) {
            // Silently ignore — final check happens again on submit via /api/register
        }
    }, 400);
});

function setError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function clearErrors() {
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    successMsg.textContent = "";
    successMsg.classList.remove("show", "error-banner");
}

function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    btnSpinner.hidden = !isLoading;
    btnText.textContent = isLoading ? "Sending code..." : "Create account";
}

function showBanner(message, isError = false) {
    successMsg.textContent = message;
    successMsg.classList.add("show");
    successMsg.classList.toggle("error-banner", isError);
}

function validateForm() {
    let isValid = true;

    // ---- name ----
    const nameVal = nameInput.value.trim();
    if (nameVal === "") {
        setError("nameError", "Name is required.");
        isValid = false;
    } else if (!/^[A-Za-z\s]{2,}$/.test(nameVal)) {
        setError("nameError", "Name should only contain letters (min 2 characters).");
        isValid = false;
    }

    // ---- username ----
    const usernameVal = usernameInput.value.trim();
    if (usernameVal === "") {
        setError("usernameError", "Username is required.");
        isValid = false;
    } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(usernameVal)) {
        setError("usernameError", "3-20 characters: letters, numbers, underscores only.");
        isValid = false;
    } else if (usernameAvailable === false) {
        setError("usernameError", "That username is taken.");
        isValid = false;
    }

    // ---- email ----
    const emailVal = emailInput.value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailVal === "") {
        setError("emailError", "Email is required.");
        isValid = false;
    } else if (!emailPattern.test(emailVal)) {
        setError("emailError", "Please enter a valid email address.");
        isValid = false;
    }

    // ---- password ----
    const passVal = passwordInput.value;
    if (passVal === "") {
        setError("passwordError", "Password is required.");
        isValid = false;
    } else if (passVal.length < 6) {
        setError("passwordError", "Password must be at least 6 characters.");
        isValid = false;
    }

    // ---- gender ----
    const genderChecked = document.querySelector('input[name="gender"]:checked');
    if (!genderChecked) {
        setError("genderError", "Please select a gender.");
        isValid = false;
    }

    // ---- skills ----
    const skillsChecked = document.querySelectorAll('input[name="skills"]:checked');
    if (skillsChecked.length === 0) {
        setError("skillsError", "Select at least one skill.");
        isValid = false;
    }

    // ---- country ----
    if (countrySelect.value === "") {
        setError("countryError", "Please select a country.");
        isValid = false;
    }

    // ---- message ----
    if (messageInput.value.trim() === "") {
        setError("messageError", "Message cannot be empty.");
        isValid = false;
    }

    return isValid;
}

form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    if (!validateForm()) return;

    const genderChecked = document.querySelector('input[name="gender"]:checked');
    const skillsChecked = document.querySelectorAll('input[name="skills"]:checked');

    const payload = {
        name: nameInput.value.trim(),
        username: usernameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
        gender: genderChecked.value,
        skills: Array.from(skillsChecked).map((s) => s.value),
        country: countrySelect.value,
        message: messageInput.value.trim(),
    };

    setLoading(true);

    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            showBanner(data.message || "Something went wrong. Please try again.", true);
            setLoading(false);
            return;
        }

        // Stash email + name so the OTP page can display/use them.
        sessionStorage.setItem("pendingEmail", payload.email);
        sessionStorage.setItem("pendingName", payload.name);

        showBanner("OTP sent! Redirecting you to verification...");

        setTimeout(() => {
            window.location.href = "otp.html";
        }, 900);
    } catch (err) {
        showBanner("Could not reach the server. Is it running?", true);
        setLoading(false);
    }
});

// clear an individual field's error as soon as the user fixes it
form.addEventListener("input", function (e) {
    const id = e.target.id;
    if (id) {
        const errorEl = document.getElementById(id + "Error");
        if (errorEl) errorEl.textContent = "";
    }
    if (e.target.name === "gender") setError("genderError", "");
    if (e.target.name === "skills") setError("skillsError", "");
});
