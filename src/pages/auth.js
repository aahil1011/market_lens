import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase.js";

/**
 * Render the Auth (Login / Signup) page into the given container.
 */
export function renderAuthPage(container) {
  let isSignup = false;

  container.innerHTML = /* html */ `
    <div class="auth-page">
      <!-- Animated background -->
      <div class="auth-bg">
        <div class="auth-orb"></div>
        <div class="auth-orb"></div>
        <div class="auth-orb"></div>
      </div>

      <div class="auth-card">
        <!-- Logo -->
        <div class="auth-logo">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#logo-grad)"/>
            <path d="M12 28V18L17 22L22 14L28 24V28" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="28" cy="14" r="3" fill="white" fill-opacity="0.9"/>
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#a855f7"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="auth-logo-text">MarketLens</span>
        </div>
        <p class="auth-subtitle">Your gateway to global financial intelligence</p>

        <!-- Title -->
        <h1 class="auth-title" id="auth-title">Welcome Back</h1>

        <!-- Error message -->
        <div class="auth-error" id="auth-error" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span id="auth-error-text"></span>
        </div>

        <form id="auth-form" autocomplete="on">
          <!-- Name field (signup only) -->
          <div class="auth-input-group auth-name-field" id="name-field">
            <label for="auth-name">Full Name</label>
            <div class="auth-input-wrapper">
              <input type="text" id="auth-name" placeholder="John Doe" autocomplete="name" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </div>

          <!-- Email -->
          <div class="auth-input-group">
            <label for="auth-email">Email Address</label>
            <div class="auth-input-wrapper">
              <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" required />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <polyline points="22,4 12,13 2,4"/>
              </svg>
            </div>
          </div>

          <!-- Password -->
          <div class="auth-input-group">
            <label for="auth-password">Password</label>
            <div class="auth-input-wrapper">
              <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password" required minlength="6" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          </div>

          <button type="submit" class="auth-submit-btn" id="auth-submit-btn">
            Sign In
          </button>
        </form>

        <div class="auth-divider">or</div>

        <button class="auth-google-btn" id="google-btn" type="button">
          <svg viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p class="auth-toggle">
          <span id="toggle-text">Don't have an account?</span>
          <button class="auth-toggle-link" id="auth-toggle-link" type="button">Sign Up</button>
        </p>
      </div>
    </div>
  `;

  // DOM references
  const form = document.getElementById("auth-form");
  const nameField = document.getElementById("name-field");
  const nameInput = document.getElementById("auth-name");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const submitBtn = document.getElementById("auth-submit-btn");
  const toggleLink = document.getElementById("auth-toggle-link");
  const toggleText = document.getElementById("toggle-text");
  const titleEl = document.getElementById("auth-title");
  const errorEl = document.getElementById("auth-error");
  const errorText = document.getElementById("auth-error-text");
  const googleBtn = document.getElementById("google-btn");

  // Toggle Login <-> Signup
  function toggleMode() {
    isSignup = !isSignup;
    titleEl.textContent = isSignup ? "Create Account" : "Welcome Back";
    submitBtn.textContent = isSignup ? "Create Account" : "Sign In";
    toggleText.textContent = isSignup
      ? "Already have an account?"
      : "Don't have an account?";
    toggleLink.textContent = isSignup ? "Sign In" : "Sign Up";

    if (isSignup) {
      nameField.classList.add("visible");
      passwordInput.setAttribute("autocomplete", "new-password");
    } else {
      nameField.classList.remove("visible");
      passwordInput.setAttribute("autocomplete", "current-password");
    }
    hideError();
  }

  toggleLink.addEventListener("click", toggleMode);

  // Show / hide error
  function showError(message) {
    errorText.textContent = message;
    errorEl.classList.add("visible");
  }

  function hideError() {
    errorEl.classList.remove("visible");
  }

  // Friendly Firebase error messages
  function getFriendlyError(code) {
    const map = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/email-already-in-use": "This email is already registered.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/invalid-credential": "Invalid credentials. Please check and try again.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    };
    return map[code] || "Something went wrong. Please try again.";
  }

  // Set loading state
  function setLoading(loading) {
    if (loading) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner"></span>${
        isSignup ? "Creating Account..." : "Signing In..."
      }`;
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? "Create Account" : "Sign In";
    }
  }

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();

    if (isSignup && !name) {
      showError("Please enter your full name.");
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // onAuthStateChanged in main.js will handle navigation
    } catch (err) {
      showError(getFriendlyError(err.code));
      setLoading(false);
    }
  });

  // Google Sign-In
  googleBtn.addEventListener("click", async () => {
    hideError();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      showError(getFriendlyError(err.code));
    }
  });
}
