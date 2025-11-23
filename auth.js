function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }

    try {
      const formData = new FormData(form);
      const payload = {
        email: (formData.get('email') || '').toString().trim(),
        password: formData.get('password') || '',
        rememberMe: formData.get('remember') === 'on',
      };

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Unable to sign in.');
      }

      window.location.href = '/home';
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || 'Unable to sign in.';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  });
}

function initSignup() {
  const form = document.getElementById('signup-form');
  if (!form) return;
  const errorEl = document.getElementById('signup-error');
  const submitBtn = document.getElementById('signup-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = '';
    const formData = new FormData(form);
    const password = formData.get('password') || '';
    const confirm = formData.get('confirm') || '';

    if (password !== confirm) {
      if (errorEl) errorEl.textContent = 'Passwords do not match.';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';
    }

    try {
      const payload = {
        name: (formData.get('name') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim(),
        password,
        rememberMe: formData.get('remember') === 'on',
      };

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Unable to create account.');
      }

      window.location.href = '/home';
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || 'Unable to create account.';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
      }
    }
  });
}

function initResetFlow() {
  const requestForm = document.getElementById('reset-request-form');
  const requestError = document.getElementById('reset-request-error');
  const requestSuccess = document.getElementById('reset-request-success');
  const requestButton = document.getElementById('reset-request-submit');
  const tokenWrapper = document.getElementById('reset-token-hint');
  const tokenValue = document.getElementById('reset-demo-token');
  const resetPanel = document.getElementById('reset-form-panel');
  const resetEmailDisplay = document.getElementById('reset-email-display');
  const resetTokenDisplay = document.getElementById('reset-token-display');
  const resetTokenLabel = document.getElementById('reset-token-label');
  const resetTokenValue = document.getElementById('reset-token-value');
  const resetHintMessage = document.getElementById('reset-hint-message');

  const params = new URLSearchParams(window.location.search);
  const prefilledEmail = (params.get('email') || '').toString().trim();
  const prefilledToken = (params.get('token') || '').toString().trim();

  if (requestForm && prefilledEmail) {
    const emailInput = requestForm.querySelector('input[name="email"]');
    if (emailInput) emailInput.value = prefilledEmail;
  }

  if (requestForm) {
    requestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (requestError) requestError.textContent = '';
      if (requestSuccess) requestSuccess.textContent = '';
      if (tokenWrapper) tokenWrapper.hidden = true;
      if (requestButton) {
        requestButton.disabled = true;
        requestButton.textContent = 'Sending...';
      }

      try {
        const formData = new FormData(requestForm);
        const payload = { email: (formData.get('email') || '').toString().trim() };
        const response = await fetch('/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || 'Unable to create reset token.');
        }

        const body = await response.json();
        if (requestSuccess) requestSuccess.textContent = body.message || 'Token generated.';
        if (body.demoToken && tokenWrapper && tokenValue) {
          tokenWrapper.hidden = false;
          tokenValue.textContent = body.demoToken;
        }
        if (body.demoToken) {
          showResetForm({
            email: payload.email,
            token: body.demoToken,
            fromLink: false,
            demoFallback: true,
          });
        }
      } catch (error) {
        if (requestError) requestError.textContent = error.message || 'Unable to create reset token.';
      } finally {
        if (requestButton) {
          requestButton.disabled = false;
          requestButton.textContent = 'Send reset link';
        }
      }
    });
  }

  const resetForm = document.getElementById('reset-form');
  const resetError = document.getElementById('reset-error');
  const resetSuccess = document.getElementById('reset-success');
  const resetButton = document.getElementById('reset-submit');
  const passwordInput = resetForm?.querySelector('input[name="password"]');

  if (resetForm) {
    if (prefilledEmail && prefilledToken) {
      showResetForm({
        email: prefilledEmail,
        token: prefilledToken,
        fromLink: true,
        demoFallback: false,
      });
    }

    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (resetError) resetError.textContent = '';
      if (resetSuccess) resetSuccess.textContent = '';

      const formData = new FormData(resetForm);
      const password = formData.get('password') || '';
      const confirm = formData.get('confirm') || '';
      if (password !== confirm) {
        if (resetError) resetError.textContent = 'Passwords do not match.';
        return;
      }

      if (resetButton) {
        resetButton.disabled = true;
        resetButton.textContent = 'Updating...';
      }

      try {
        const payload = {
          email: (formData.get('email') || '').toString().trim(),
          token: (formData.get('token') || '').toString().trim(),
          password,
          rememberMe: formData.get('remember') === 'on',
        };

        if (!payload.email || !payload.token) {
          throw new Error('Please request a reset link first.');
        }

        const response = await fetch('/api/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || 'Unable to reset password.');
        }

        const body = await response.json();
        if (resetSuccess) resetSuccess.textContent = body.message || 'Password updated.';
        setTimeout(() => {
          window.location.href = '/home';
        }, 1200);
      } catch (error) {
        if (resetError) resetError.textContent = error.message || 'Unable to reset password.';
      } finally {
        if (resetButton) {
          resetButton.disabled = false;
          resetButton.textContent = 'Update password';
        }
      }
    });
  }

  function showResetForm({ email, token, fromLink, demoFallback }) {
    if (!resetForm || !resetPanel || !email || !token) return;
    const emailInput = resetForm.querySelector('input[name="email"]');
    const tokenInput = resetForm.querySelector('input[name="token"]');

    if (emailInput) emailInput.value = email;
    if (tokenInput) tokenInput.value = token;

    if (resetEmailDisplay) {
      resetEmailDisplay.textContent = `Resetting password for ${email}`;
    }

    if (resetTokenDisplay && resetTokenLabel && resetTokenValue) {
      if (demoFallback) {
        resetTokenLabel.textContent = 'Use this token:';
        resetTokenValue.textContent = token;
        resetTokenDisplay.hidden = false;
      } else {
        resetTokenDisplay.hidden = true;
      }
    }

    if (resetHintMessage) {
      resetHintMessage.textContent = fromLink
        ? 'We pre-filled your details from the email link. Set a new password to finish.'
        : 'Use the token above to set a new password.';
    }

    resetPanel.hidden = false;
    if (passwordInput) passwordInput.focus();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login') {
    initLogin();
  } else if (page === 'signup') {
    initSignup();
  } else if (page === 'reset') {
    initResetFlow();
  }
});
