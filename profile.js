function selectProfileElements() {
  return {
    avatarImage: document.getElementById('profile-page-avatar-image'),
    avatarLetter: document.getElementById('profile-page-avatar-letter'),
    greeting: document.getElementById('profile-page-greeting'),
    email: document.getElementById('profile-page-email'),
    name: document.getElementById('profile-page-name'),
    emailDetail: document.getElementById('profile-page-email-detail'),
    joined: document.getElementById('profile-page-joined'),
  };
}

async function loadProfile(elements) {
  try {
    const response = await fetch('/api/auth/me');
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch profile');
    const payload = await response.json();
    if (!payload.user) {
      window.location.href = '/login';
      return;
    }
    updateProfileUI(elements, payload.user);
  } catch (error) {
    console.error('Failed to load profile', error);
  }
}

function updateProfileUI(elements, user) {
  const trimmedName = (user.name || 'User').trim();
  const firstName = trimmedName.split(' ')[0] || trimmedName || 'User';
  if (elements.greeting) {
    elements.greeting.textContent = `Hi, ${firstName}!`;
  }
  if (elements.email) {
    elements.email.textContent = user.email || '';
  }
  if (elements.name) {
    elements.name.textContent = trimmedName || '—';
  }
  if (elements.emailDetail) {
    elements.emailDetail.textContent = user.email || '—';
  }
  if (elements.joined) {
    elements.joined.textContent = formatJoinDate(user.createdAt);
  }

  const initial = trimmedName.charAt(0).toUpperCase() || 'U';
  if (user.profileImage && elements.avatarImage) {
    elements.avatarImage.src = user.profileImage;
    elements.avatarImage.hidden = false;
    if (elements.avatarLetter) elements.avatarLetter.hidden = true;
  } else {
    if (elements.avatarLetter) {
      elements.avatarLetter.textContent = initial;
      elements.avatarLetter.hidden = false;
    }
    if (elements.avatarImage) {
      elements.avatarImage.hidden = true;
      elements.avatarImage.removeAttribute('src');
    }
  }
}

function formatJoinDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_error) {
    return '—';
  }
}

async function handleLogout(button) {
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Signing out...';
    }
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Failed to sign out', error);
  } finally {
    window.location.href = '/login';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const elements = selectProfileElements();
  loadProfile(elements);
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn?.addEventListener('click', () => handleLogout(logoutBtn));
});
