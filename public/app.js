// app.js (fixed)
const API_KEY = '4c9773f9-80e0-4869-885c-c72c5242a106';
const modal = document.getElementById('modal');
const authBox = document.querySelector('.auth');

let allEvents = [];
let eventMarkers = [];
let currentFilter = 'all'; // Track active filter

/* ===== MAP ===== */
const map = new mapgl.Map('map', {
  key: API_KEY,
  center: [71.4491, 51.1694],
  zoom: 12
});

/* ===== USER ===== */
function token() {
  return localStorage.getItem('token');
}

function user() {
  return token() ? JSON.parse(atob(token().split('.')[1])) : null;
}

function logout() {
  localStorage.removeItem('token');
  location.reload();
}

function closeModal() {
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

/* ===== SIDEBAR ===== */
async function renderAuth() {
  const u = user();
  let businessStatus = '';
  if (u && u.role === 'user') {
    try {
      const res = await fetch('/business-status', {
        headers: {
          Authorization: 'Bearer ' + token()
        }
      });
      const data = await res.json();
      if (data.status === 'pending') {
        businessStatus = '<div>Заявка на рассмотрении</div>';
      }
    } catch {}
  }
  authBox.innerHTML = !u ? `
    <button onclick="openLogin()">Войти</button>
    <button onclick="openRegister()">Регистрация</button>
  ` : `
    <div>Роль: ${escapeHtml(u.role)}</div>
    ${businessStatus}
    ${u.role === 'user' ? `<button onclick="openBusiness()">Стать бизнесом</button>` : ''}
    ${u.role === 'admin' ? `<button onclick="openAdminPanel()">Админ панель</button>` : ''}
    ${(u.role === 'business' || u.role === 'admin') ? `<button onclick="deleteAllEvents()">${u.role === 'admin' ? 'Удалить все события' : 'Удалить мои события'}</button>` : ''}
    <button onclick="logout()">Выйти</button>
  `;
}
renderAuth();

let toggled = false;

function changeColor() {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("dark");
}

document.querySelectorAll('.filters button').forEach((btn, index) => {
  btn.addEventListener('click', () => {
    currentFilter = index === 0 ? 'evening' : index === 1 ? 'week' : 'weekend';
    applyFilters();
  });
});

const searchInput = document.querySelector('.search');
searchInput.addEventListener('input', (evt) => {
  applyFilters(evt.target.value.toLowerCase());
});

/* ===== EVENTS LOAD ===== */
fetch('/events')
  .then(r => r.json())
  .then(events => {
    allEvents = events;
    applyFilters();
  });

function applyFilters(query = '') {
  // Clear existing markers
  eventMarkers.forEach(({ marker }) => marker.destroy());
  eventMarkers.length = 0;

  const now = new Date();
  let filteredEvents = allEvents;

  if (currentFilter === 'evening') {
    const eveningStart = new Date(now.setHours(18, 0, 0, 0));
    const eveningEnd = new Date(now.setHours(23, 59, 59, 999));
    filteredEvents = allEvents.filter(e => {
      const eventDate = new Date(e.date);
      return eventDate >= eveningStart && eventDate <= eveningEnd;
    });
  } else if (currentFilter === 'week') {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    filteredEvents = allEvents.filter(e => {
      const eventDate = new Date(e.date);
      return eventDate >= now && eventDate <= weekEnd;
    });
  } else if (currentFilter === 'weekend') {
    const nextSat = new Date(now);
    nextSat.setDate(nextSat.getDate() + (6 - nextSat.getDay() + 7) % 7);
    const nextSun = new Date(nextSat);
    nextSun.setDate(nextSun.getDate() + 1);
    filteredEvents = allEvents.filter(e => {
      const eventDate = new Date(e.date);
      return eventDate >= nextSat && eventDate <= nextSun;
    });
  }

  // Apply search query
  if (query) {
    filteredEvents = filteredEvents.filter(e => 
      e.title.toLowerCase().includes(query) || e.description.toLowerCase().includes(query)
    );
  }

  // Add filtered markers
  filteredEvents.forEach(e => {
    const marker = new mapgl.Marker(map, { 
      coordinates: [e.lng, e.lat],
      icon: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png' // Fixed CORS-safe icon
    });
    marker.on('click', () => openEventDetails(e));
    eventMarkers.push({ marker, event: e });
  });
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openEventDetails(event) {
  let content = `
    <div class="box">
      <button class="close" onclick="closeModal()">×</button>
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.description)}</p>
      <p>Дата: ${new Date(event.date).toLocaleString()}</p>
  `;
  const u = user();
  if (u && (u.id === event.creator_id || u.role === 'admin')) {
    content += `<button onclick="deleteEvent(${event.id})">Удалить</button>`;
  }
  content += `</div>`;
  modal.innerHTML = content;
  modal.classList.remove('hidden');
}

function deleteEvent(id) {
  if (confirm('Вы уверены?')) {
    fetch(`/events/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer ' + token()
      }
    })
    .then(r => {
      if (!r.ok) {
        if (r.status === 403) {
          alert('Вы не имеете права удалять это событие.');
        } else {
          throw new Error(`HTTP ${r.status}`);
        }
      }
      allEvents = allEvents.filter(e => e.id !== id);
      applyFilters(searchInput.value.toLowerCase());
    })
    .catch(err => {
      console.error(err);
      alert('Ошибка удаления события');
    });
  }
}

function deleteAllEvents() {
  if (confirm('Вы уверены?')) {
    fetch('/events', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer ' + token()
      }
    })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const u = user();
      if (u.role === 'admin') {
        allEvents = [];
      } else {
        allEvents = allEvents.filter(e => e.creator_id !== u.id);
      }
      applyFilters(searchInput.value.toLowerCase());
    })
    .catch(err => {
      console.error(err);
      alert('Ошибка удаления событий');
    });
  }
}

/* ===== GEOLOCATION AND ROUTING ===== */
const reqUrl = 'https://routing.api.2gis.com/routing/7.0.0/global?key=4c9773f9-80e0-4869-885c-c72c5242a106';
const markers = [];
let firstPoint = null;
let secondPoint = null;
let routeLine = null;
let selecting = 'none';
const routeButton = document.getElementById('routeButton');
const resetButton = document.getElementById('resetButton');

routeButton.addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const userPosition = [lng, lat];
      firstPoint = { lon: lng, lat: lat };
      selecting = 'b';
      map.setCenter(userPosition, { duration: 1200 });
      map.setZoom(15, { duration: 800 });
      if (window.userMarker) {
        window.userMarker.destroy();
      }
      window.userMarker = new mapgl.Marker(map, {
        coordinates: userPosition,
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        size: [25, 41],
        anchor: [12, 41],
        label: {
          text: 'Вы здесь',
          offset: [0, -12],
          color: '#1e6cff'
        }
      });
      markers.push(window.userMarker);
      routeButton.disabled = true;
      resetButton.disabled = false;
      resetButton.textContent = 'Выберите точку назначения';
    },
    (error) => {
      let msg = 'Ошибка определения местоположения';
      if (error.code === 1) msg = 'Геолокация запрещена в настройках браузера';
      if (error.code === 2) msg = 'Позиция недоступна';
      if (error.code === 3) msg = 'Превышено время ожидания';
      alert(msg + '. Выберите начальную точку на карте.');
      selecting = 'a';
      routeButton.disabled = true;
      resetButton.disabled = false;
      resetButton.textContent = 'Выберите начальную точку';
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
});

resetButton.addEventListener('click', () => {
  selecting = 'none';
  firstPoint = null;
  secondPoint = null;
  if (routeLine) routeLine.destroy();
  markers.forEach((marker) => marker.destroy());
  markers.length = 0;
  routeButton.disabled = false;
  resetButton.disabled = true;
  resetButton.textContent = 'Сбросить';
  map.setCenter([71.4491, 51.1694], { duration: 1200 });
  map.setZoom(12, { duration: 800 });
});

/* ===== MAP CLICK ===== */
map.on('click', e => {
  const u = user();
  if (selecting === 'a') {
    const lng = e.lngLat[0];
    const lat = e.lngLat[1];
    firstPoint = { lon: lng, lat: lat };
    selecting = 'b';
    const marker = new mapgl.Marker(map, {
      coordinates: [lng, lat],
      icon: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    });
    markers.push(marker);
    resetButton.textContent = 'Выберите точку назначения';
  } else if (selecting === 'b') {
    const lng = e.lngLat[0];
    const lat = e.lngLat[1];
    secondPoint = { lon: lng, lat: lat };
    selecting = 'end';
    const marker = new mapgl.Marker(map, {
      coordinates: [lng, lat],
      icon: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    });
    markers.push(marker);
    fetchRoute([firstPoint, secondPoint]);
    resetButton.textContent = 'Сбросить маршрут';
  } else {
    if (!u || u.verification_status !== 'verified') return;
    openEventForm(e.lngLat[1], e.lngLat[0]);
  }
});

function fetchRoute(points) {
  const transport = document.getElementById('transport').value;

  // Старый код для driving / walking
  fetch(reqUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      points,
      locale: "ru",
      transport,
      filters: ["dirt_road", "toll_road", "ferry"],
      output: "detailed"
    })
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      return res.json();
    })
    .then((parsed) => {
      if (parsed.result && parsed.result.length > 0) {
        const coordinates = parsed.result[0].maneuvers
          .flatMap((maneuver) => {
            if (
              maneuver.outcoming_path &&
              maneuver.outcoming_path.geometry &&
              maneuver.outcoming_path.geometry.length > 0
            ) {
              return maneuver.outcoming_path.geometry
                .flatMap((geometry) => {
                  const selection = geometry.selection;
                  const match = selection.match(/LINESTRING\(([\s\S]*)\)/);
                  if (match) {
                    return match[1].split(',').map(point => point.trim().split(/\s+/).map(Number));
                  }
                  return [];
                });
            }
            return [];
          });
        if (coordinates.length > 0) {
          renderRoute(coordinates);
        } else {
          console.error("No coordinates found in response");
          alert('Ошибка построения маршрута: Нет координат');
        }
      } else {
        console.error("No route found in response");
        alert('Ошибка построения маршрута: Маршрут не найден');
      }
    })
    .catch((err) => {
      console.error("Error fetching route data:", err.message || err);
      alert('Ошибка построения маршрута');
    });
}

function renderRoute(coordinates) {
  if (routeLine) {
    routeLine.destroy();
  }
  routeLine = new mapgl.Polyline(map, {
    coordinates,
    width: 6,
    color: "#0078FF",
  });
}

/* ===== ADMIN PANEL ===== */
function openAdminPanel() {
  fetch('/admin/requests', {
    headers: {
      Authorization: 'Bearer ' + token()
    }
  })
  .then(r => r.json())
  .then(requests => {
    let content = `
      <div class="box">
        <button class="close" onclick="closeModal()">×</button>
        <h3>Заявки на бизнес</h3>
    `;
    if (requests.length === 0) {
      content += '<p>Нет заявок</p>';
    } else {
      requests.forEach(req => {
        content += `
          <div>
            <p>Компания: ${escapeHtml(req.company_name)}</p>
            <p>БИН: ${escapeHtml(req.bin)}</p>
            <p>Телефон: ${escapeHtml(req.phone)}</p>
            <p>Адрес: ${escapeHtml(req.address)}</p>
            <p>Сайт: ${escapeHtml(req.website)}</p>
            <button onclick="approveRequest(${req.id})">Одобрить</button>
            <button onclick="rejectRequest(${req.id})">Отклонить</button>
          </div>
          <hr>
        `;
      });
    }
    content += '</div>';
    modal.innerHTML = content;
    modal.classList.remove('hidden');
  })
  .catch(err => {
    console.error(err);
    alert('Ошибка загрузки заявок');
  });
}

function approveRequest(id) {
  fetch(`/admin/approve/${id}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token()
    }
  })
  .then(() => {
    alert('Заявка одобрена');
    openAdminPanel(); // обновляем панель
  })
  .catch(() => alert('Ошибка одобрения'));
}

function rejectRequest(id) {
  fetch(`/admin/reject/${id}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token()
    }
  })
  .then(() => {
    alert('Заявка отклонена');
    openAdminPanel(); // обновляем панель
  })
  .catch(() => alert('Ошибка отклонения'));
}

/* ===== MODALS ===== */
function openLogin() {
  modal.innerHTML = `
    <div class="box">
      <button class="close" onclick="closeModal()">×</button>
      <input id="e" placeholder="Email">
      <input id="p" type="password" placeholder="Пароль">
      <button onclick="login()">Войти</button>
    </div>`;
  modal.classList.remove('hidden');
}

function openRegister() {
  modal.innerHTML = `
    <div class="box">
      <button class="close" onclick="closeModal()">×</button>
      <input id="e" placeholder="Email">
      <input id="p" type="password" placeholder="Пароль">
      <button onclick="register()">Регистрация</button>
    </div>`;
  modal.classList.remove('hidden');
}

function login() {
  const email = document.getElementById('e').value;
  const password = document.getElementById('p').value;
  fetch('/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, password })
  })
  .then(r => {
    if (!r.ok) throw new Error('Login failed');
    return r.json();
  })
  .then(d => {
    localStorage.setItem('token', d.token);
    location.reload();
  })
  .catch(() => alert('Ошибка входа'));
}

function register() {
  const email = document.getElementById('e').value;
  const password = document.getElementById('p').value;
  fetch('/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, password })
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    openLogin();
  })
  .catch(err => {
    console.error(err);
    alert('Ошибка регистрации. Возможно, email уже используется.');
  });
}

function openBusiness() {
  modal.innerHTML = `
    <div class="box">
      <button class="close" onclick="closeModal()">×</button>
      <input id="c" placeholder="Компания">
      <input id="b" placeholder="БИН">
      <input id="ph" placeholder="Телефон">
      <input id="a" placeholder="Адрес">
      <input id="w" placeholder="Сайт">
      <button onclick="sendReq()">Отправить</button>
    </div>`;
  modal.classList.remove('hidden');
}

function sendReq() {
  const company_name = document.getElementById('c').value;
  const bin = document.getElementById('b').value;
  const phone = document.getElementById('ph').value;
  const address = document.getElementById('a').value;
  const website = document.getElementById('w').value;
  fetch('/business-request', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:'Bearer ' + token()
    },
    body: JSON.stringify({ company_name, bin, phone, address, website })
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    alert('Заявка отправлена');
    closeModal();
    renderAuth();
  })
  .catch(err => {
    console.error(err);
    alert('Ошибка отправки заявки');
  });
}

function openEventForm(lat, lng) {
  modal.innerHTML = `
    <div class="box">
      <button class="close" onclick="closeModal()">×</button>
      <input id="t" placeholder="Название ивента">
      <input id="d" type="datetime-local">
      <textarea id="desc" placeholder="Описание"></textarea>
      <button onclick="createMapEvent(${lat}, ${lng})">Создать</button>
    </div>`;
  modal.classList.remove('hidden');
}

function createMapEvent(lat, lng) {
  const title = document.getElementById('t').value;
  const dateInput = document.getElementById('d').value;
  const description = document.getElementById('desc').value;
  if (!title || !dateInput) {
    alert('Заполните название и дату');
    return;
  }
  const date = new Date(dateInput).toISOString();
  fetch('/events', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:'Bearer ' + token()
    },
    body: JSON.stringify({
      title,
      description,
      lat,
      lng,
      date
    })
  })
  .then(r => {
    if (!r.ok) {
      if (r.status === 403) {
        alert('Вы не имеете права создавать события. Станьте бизнес-пользователем или администратором.');
      } else if (r.status === 400) {
        alert('Неверные данные для создания события.');
      } else if (r.status === 401) {
        alert('Не авторизованы. Пожалуйста, войдите в систему.');
      } else {
        throw new Error(`HTTP ${r.status}`);
      }
      return; // Не продолжаем если ошибка
    }
    return r.json();
  })
  .then(data => {
    if (data) { // Только если успешно
      allEvents.push({ title, description, lat, lng, date, id: data.id, creator_id: user().id });
      applyFilters(searchInput.value.toLowerCase());
      alert('Событие создано');
      closeModal();
    }
  })
  .catch((err) => {
    console.error(err);
    alert('Ошибка создания события');
  });
}