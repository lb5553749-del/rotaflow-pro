// ============================================================
//  RotaFlow Pro - Sugestões sem badge "(na agenda)"
// ============================================================

let map, geocoder, autocomplete;
let deliveries = [], agenda = [];
let nextSequenceNumber = 1, nextAgendaId = 1;
let markersList = [], watchId = null, gpsMarker = null;
let routeFilter = "", agendaFilter = "";
let currentSelectedDelivery = null;
let highlightedMarker = null;
let tempPhones = [];

let userProfile = {
    motorista: "Motorista",
    mensagemPadrao: "Olá {nome}! 🚚\nSua encomenda ({id} - {pacotes} pacote(s)) está a caminho.\n📍 Endereço: {endereco}\n{obs}\n⚠️ Estamos chegando em breve! Por favor, esteja disponível para receber.⚠️\n📦 Correx express"
};

const PORTO_VELHO_CENTER = { lat: -8.7619, lng: -63.9038 };
const PORTO_VELHO_RADIUS = 50000;
const mapStyle = [
    { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
    { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
    { "featureType": "landscape", "stylers": [{ "visibility": "off" }] },
    { "featureType": "administrative.neighborhood", "stylers": [{ "visibility": "off" }] },
    { "featureType": "road", "elementType": "labels", "stylers": [{ "visibility": "on" }] },
    { "featureType": "water", "stylers": [{ "visibility": "simplified" }] }
];

function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function markerIcon(color, opacity) {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: color,
        fillOpacity: opacity,
        strokeWeight: 1.5,
        strokeColor: "white"
    };
}

function markerColorFor(delivery) {
    return (delivery.pacotes || 1) >= 2 ? "#EF4444" : "#3b82f6";
}

function markerOpacityFor(delivery) {
    return delivery.status === "entregue" ? 0.35 : 1;
}

function upsertMarker(delivery) {
    if (!map || !delivery.lat || !delivery.lng) return;
    let marker = markersList.find(m => m.sequentialId === delivery.sequentialId);
    if (!marker) {
        markersList.push(createPinMarker(delivery));
        return;
    }
    marker.setPosition({ lat: delivery.lat, lng: delivery.lng });
    updateMarkerIcon(marker, delivery);
}

function removeMarkerById(sequentialId) {
    const idx = markersList.findIndex(m => m.sequentialId === sequentialId);
    if (idx === -1) return;
    markersList[idx].setMap(null);
    markersList.splice(idx, 1);
    if (highlightedMarker && highlightedMarker.sequentialId === sequentialId) highlightedMarker = null;
}

function switchSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sidebar-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
    });
}

function statusKeyFromLabel(value) {
    const map = { 'Pendente': 'pendente', 'Em rota': 'em-rota', 'Entregue': 'entregue', 'Falhou': 'falhou' };
    return map[value] || value;
}

let saveTimer = null;

// ========== UTILITÁRIOS ==========
function getDigits(phone) { return phone ? phone.replace(/\D/g, '') : ""; }
function formatPhoneNumber(raw) {
    if (!raw) return "";
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('55')) digits = digits.substring(2);
    if (digits.length >= 2 && digits.substring(0, 2) !== '69') digits = '69' + digits;
    const full = '55' + digits;
    if (full.length === 13) return `+${full.substring(0,2)} ${full.substring(2,4)} ${full.substring(4,5)} ${full.substring(5,9)}-${full.substring(9)}`;
    if (full.length === 12) return `+${full.substring(0,2)} ${full.substring(2,4)} ${full.substring(4,8)}-${full.substring(8)}`;
    return `+${full.substring(0,2)} ${full.substring(2,4)} ${full.substring(4)}`;
}
function formatPhoneShort(phone) {
    if (!phone) return "";
    let d = getDigits(phone);
    if (d.length >= 10) return `${d.slice(0,2)} ${d.slice(2,7)}-${d.slice(7,11)}`;
    return d;
}
function getWhatsAppLink(phone, msg) { 
    let d = getDigits(phone); 
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg)}` : null; 
}
function showToast(msg, err = false) {
    let t = document.createElement('div'); t.className = 'toast-message';
    t.style.background = err ? '#dc2626' : '#0f172a';
    const icon = document.createElement('i');
    icon.className = `fas ${err ? 'fa-exclamation-triangle' : 'fa-check-circle'}`;
    t.appendChild(icon);
    t.appendChild(document.createTextNode(' ' + msg));
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
function getSequentialId(seq) {
    const letterIndex = Math.floor((seq - 1) / 10);
    const number = ((seq - 1) % 10) + 1;
    const letter = String.fromCharCode(65 + letterIndex);
    return `${letter}${number}`;
}
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ========== MIGRAÇÃO E PERSISTÊNCIA ==========
function migrateTelefones(obj) {
    if (!obj) return;
    if (obj.telefones && Array.isArray(obj.telefones) && obj.telefones.length > 0 && typeof obj.telefones[0] === 'string') {
        obj.telefones = obj.telefones.map(num => ({ numero: num, label: '' }));
    }
    if (!obj.telefones) obj.telefones = [];
    if (obj.telefone && typeof obj.telefone === 'string') {
        obj.telefones.push({ numero: obj.telefone, label: '' });
        delete obj.telefone;
    }
    return obj;
}
function migrateFavorito(obj) {
    if (obj.favorito === undefined) obj.favorito = false;
    return obj;
}

function persistStorageNow() {
    localStorage.setItem("rotaflow_data", JSON.stringify({ deliveries, nextSequenceNumber }));
    localStorage.setItem("rotaflow_agenda", JSON.stringify({ agenda, nextAgendaId }));
    localStorage.setItem("rotaflow_profile", JSON.stringify(userProfile));
}
function saveStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStorageNow, 80);
}

function loadStorage() {
    const saved = localStorage.getItem("rotaflow_data");
    if (saved) { try { const data = JSON.parse(saved); deliveries = data.deliveries || []; deliveries.forEach(d => { migrateTelefones(d); migrateFavorito(d); if (d.pacotes === undefined) d.pacotes = 1; if (d.savedToAgenda === undefined) d.savedToAgenda = false; if (!d.photos) d.photos = []; if (d.notes === undefined) d.notes = ''; }); nextSequenceNumber = data.nextSequenceNumber || (deliveries.length + 1); } catch(e){} }
    const savedAgenda = localStorage.getItem("rotaflow_agenda");
    if (savedAgenda) { try { const data = JSON.parse(savedAgenda); agenda = data.agenda || []; agenda.forEach(a => { migrateTelefones(a); migrateFavorito(a); if (a.pacotes === undefined) a.pacotes = 1; if (!a.photos) a.photos = []; if (a.notes === undefined) a.notes = ''; }); nextAgendaId = data.nextAgendaId || 1; } catch(e){} }
    const savedProfile = localStorage.getItem("rotaflow_profile");
    if (savedProfile) { try { userProfile = JSON.parse(savedProfile); } catch(e){} }
    document.getElementById("agendaCountBadge").innerHTML = agenda.length;
    updateDeliveryStats();
    renderDeliveriesList(); renderAgendaList();
    if (map) rebuildMarkers(false);
    updateProgressAndEstimates();
}

// ========== SINCRONIZAÇÃO DE FAVORITOS ==========
function syncFavoritoToAgenda(delivery) {
    const agendaItem = agenda.find(item => 
        item.endereco.toLowerCase() === delivery.endereco.toLowerCase()
    );
    if (agendaItem && agendaItem.favorito !== delivery.favorito) {
        agendaItem.favorito = delivery.favorito;
        saveStorage();
        renderAgendaList();
        return true;
    }
    return false;
}
function syncAgendaByDelivery(delivery) {
    const agendaItem = agenda.find(item => 
        item.endereco.toLowerCase() === delivery.endereco.toLowerCase()
    );
    if (agendaItem) {
        let changed = false;
        const str1 = JSON.stringify(delivery.telefones || []);
        const str2 = JSON.stringify(agendaItem.telefones || []);
        if (str1 !== str2) {
            agendaItem.telefones = delivery.telefones || [];
            changed = true;
        }
        if (agendaItem.favorito !== delivery.favorito) {
            agendaItem.favorito = delivery.favorito;
            changed = true;
        }
        if (changed) {
            saveStorage();
            renderAgendaList();
            showToast("Dados atualizados na agenda", false);
        }
    }
}

// ========== VALIDAÇÃO DE ENDEREÇO DUPLICADO NA ROTA ==========
let duplicateCheckTimer = null;
function checkAddressDuplicate() {
    const addressInput = document.getElementById('address');
    const warningDiv = document.getElementById('addressWarning');
    const warningText = document.getElementById('addressWarningText');
    const address = addressInput.value.trim().toLowerCase();
    if (!address) {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        return;
    }
    const found = deliveries.find(d => d.endereco.toLowerCase() === address);
    if (found) {
        warningText.textContent = `Endereço já está na rota (ID: ${found.sequentialId})`;
        warningDiv.classList.add('show');
        addressInput.classList.add('duplicate');
        warningDiv.onclick = () => {
            document.getElementById('customerName').value = found.nome;
            document.getElementById('address').value = found.endereco;
            tempPhones = found.telefones || [];
            renderTempPhones();
            document.getElementById('pacotes').value = found.pacotes || 1;
            warningDiv.classList.remove('show');
            addressInput.classList.remove('duplicate');
            showToast(`Dados de ${found.sequentialId} preenchidos`, false);
        };
    } else {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        warningDiv.onclick = null;
    }
}

// ========== MARCADORES ==========
function createPinMarker(delivery) {
    const color = markerColorFor(delivery);
    const opacity = markerOpacityFor(delivery);
    const marker = new google.maps.Marker({
        position: { lat: delivery.lat, lng: delivery.lng },
        map: map,
        label: { text: delivery.sequentialId, color: "white", fontWeight: "bold", fontSize: "10px" },
        icon: markerIcon(color, opacity),
        title: `${delivery.sequentialId} - ${delivery.nome}`,
        optimized: true
    });
    marker.sequentialId = delivery.sequentialId;
    marker.addListener("click", () => {
        highlightMarker(marker, delivery);
        openDeliveryPanel(delivery);
    });
    return marker;
}

function highlightMarker(marker, delivery) {
    if (highlightedMarker && highlightedMarker !== marker) {
        resetMarkerStyle(highlightedMarker);
    }
    highlightedMarker = marker;
    const opacity = markerOpacityFor(delivery);
    marker.setIcon(markerIcon("#1E3A8A", opacity));
    marker.setLabel({ text: delivery.sequentialId, color: "white", fontWeight: "bold", fontSize: "10px" });
}

function resetMarkerStyle(marker) {
    const delivery = deliveries.find(d => d.sequentialId === marker.sequentialId);
    if (!delivery) return;
    marker.setIcon(markerIcon(markerColorFor(delivery), markerOpacityFor(delivery)));
    marker.setLabel({ text: delivery.sequentialId, color: "white", fontWeight: "bold", fontSize: "10px" });
}

function updateMarkerIcon(marker, delivery) {
    if (!marker) return;
    const color = highlightedMarker === marker ? "#1E3A8A" : markerColorFor(delivery);
    marker.setIcon(markerIcon(color, markerOpacityFor(delivery)));
    marker.setLabel({ text: delivery.sequentialId, color: "white", fontWeight: "bold", fontSize: "10px" });
    marker.setTitle(`${delivery.sequentialId} - ${delivery.nome}`);
}

function rebuildMarkers(centerMap = true) {
    if (!map) return;
    markersList.forEach(m => m.setMap(null));
    markersList = [];
    deliveries.forEach(del => { if (del.lat && del.lng) markersList.push(createPinMarker(del)); });
    highlightedMarker = null;
    if (centerMap) centerMapOnMarkers();
    updateDeliveryStats();
    updateProgressAndEstimates();
}

function centerMapOnMarkers() {
    if (!map) return;
    let bounds = new google.maps.LatLngBounds();
    let has = false;
    deliveries.forEach(d => { if (d.lat && d.lng) { bounds.extend({ lat: d.lat, lng: d.lng }); has = true; } });
    if (has) map.fitBounds(bounds);
    else map.setCenter(PORTO_VELHO_CENTER);
}

function updateDeliveryStats() {
    const total = deliveries.length;
    const entregues = deliveries.filter(d => d.status === 'entregue').length;
    const pendentes = total - entregues;
    document.getElementById('deliveryCount').innerText = total;
    document.getElementById('deliveredCount').innerText = entregues;
    document.getElementById('pendingCount').innerText = pendentes;
    document.getElementById('deliveryCountBadge').innerHTML = total;
    updateProgressAndEstimates();
}

function updateProgressAndEstimates() {
    const total = deliveries.length;
    const entregues = deliveries.filter(d => d.status === 'entregue').length;
    const percent = total === 0 ? 0 : Math.round((entregues / total) * 100);
    document.getElementById('progressPercent').innerText = percent + '%';
    document.getElementById('progressFill').style.width = percent + '%';

    const pendentes = deliveries.filter(d => d.status !== 'entregue');
    if (pendentes.length > 1) {
        let coords = pendentes.map(d => ({ lat: d.lat, lng: d.lng }));
        let totalDist = 0;
        for (let i = 1; i < coords.length; i++) {
            totalDist += haversineDistance(coords[i-1].lat, coords[i-1].lng, coords[i].lat, coords[i].lng);
        }
        let timeMin = totalDist / 30 * 60;
        document.getElementById('distanceEstimate').innerHTML = `Dist: ${totalDist.toFixed(1)} km`;
        document.getElementById('timeEstimate').innerHTML = `Tempo: ~${Math.round(timeMin)} min`;
    } else if (pendentes.length <= 1) {
        document.getElementById('distanceEstimate').innerHTML = 'Dist: --';
        document.getElementById('timeEstimate').innerHTML = 'Tempo: --';
    }
}

function updateLastIdDisplay(deliveryId) {
    const container = document.getElementById('lastIdContainer');
    const valueSpan = document.getElementById('lastIdValue');
    if (deliveryId) {
        valueSpan.innerText = deliveryId;
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

// ========== LIMPEZA DO FORMULÁRIO ==========
function clearForm() {
    document.getElementById("customerName").value = "";
    document.getElementById("address").value = "";
    document.getElementById("newPhoneInput").value = "";
    document.getElementById("newPhoneLabel").value = "";
    tempPhones = [];
    renderTempPhones();
    document.getElementById("pacotes").value = "1";
    document.getElementById("saveToAgendaCheckbox").checked = false;
    document.getElementById("nameSuggestions").style.display = 'none';
    document.getElementById('addressWarning').classList.remove('show');
    document.getElementById('address').classList.remove('duplicate');
}

// ========== PAINEL INFERIOR ==========
function openDeliveryPanel(delivery) {
    currentSelectedDelivery = delivery;
    const panel = document.getElementById('deliveryPanel');
    if ((delivery.pacotes || 1) >= 2) {
        panel.classList.add('red-bg');
    } else {
        panel.classList.remove('red-bg');
    }
    document.getElementById('panelIdBadge').innerText = delivery.sequentialId;
    document.getElementById('panelName').innerText = delivery.nome;
    document.getElementById('panelAddressText').textContent = delivery.endereco;
    const pacotesSpan = document.getElementById('panelPacotesValue');
    pacotesSpan.innerText = delivery.pacotes || 1;
    if ((delivery.pacotes || 1) >= 2) {
        pacotesSpan.classList.add('pacotes-highlight');
    } else {
        pacotesSpan.classList.remove('pacotes-highlight');
    }
    const phoneContainer = document.getElementById('panelPhone');
    if (delivery.telefones && delivery.telefones.length) {
        phoneContainer.textContent = delivery.telefones.map(p => {
            const label = p.label ? p.label + ': ' : '';
            return label + formatPhoneShort(p.numero);
        }).join(', ');
    } else {
        phoneContainer.textContent = 'Não informado';
    }
    const obsText = delivery.notes ? delivery.notes : 'Nenhuma observação';
    document.getElementById('panelObsText').innerText = obsText;
    refreshPanelPhotos(delivery);
    const actionsDiv = document.getElementById('panelActions');
    actionsDiv.innerHTML = '';
    if (delivery.status === 'entregue') {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'panel-action-btn undo';
        undoBtn.innerHTML = '<i class="fas fa-undo-alt"></i> Desfazer entrega';
        undoBtn.onclick = () => { undoDelivered(delivery.id); closeDeliveryPanel(); };
        actionsDiv.appendChild(undoBtn);
    } else {
        const deliverBtn = document.createElement('button');
        deliverBtn.className = 'panel-action-btn deliver';
        deliverBtn.innerHTML = '<i class="fas fa-check-circle"></i> Entregar';
        deliverBtn.onclick = () => { markDelivered(delivery.id); closeDeliveryPanel(); };
        actionsDiv.appendChild(deliverBtn);
    }
    if (delivery.telefones && delivery.telefones.length) {
        const whatsBtn = document.createElement('button');
        whatsBtn.className = 'panel-action-btn whatsapp';
        whatsBtn.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp';
        whatsBtn.onclick = () => sendWhatsApp(delivery);
        actionsDiv.appendChild(whatsBtn);
    }
    panel.classList.add('open');
}

function refreshPanelPhotos(delivery) {
    const container = document.getElementById('panelPhotos');
    container.innerHTML = '';
    if (delivery.photos && delivery.photos.length) {
        delivery.photos.forEach((photo, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'photo-wrapper';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'panel-photo';
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                openGallery(delivery.photos, idx);
            });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-panel-photo';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                delivery.photos.splice(idx, 1);
                saveStorage();
                refreshPanelPhotos(delivery);
                renderDeliveriesList();
                showToast('Foto removida');
            });
            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            container.appendChild(wrapper);
        });
    } else {
        container.innerHTML = '<span style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
    }
}

function closeDeliveryPanel() {
    const panel = document.getElementById('deliveryPanel');
    panel.classList.remove('open');
    panel.classList.remove('red-bg');
    currentSelectedDelivery = null;
    if (highlightedMarker) {
        resetMarkerStyle(highlightedMarker);
        highlightedMarker = null;
    }
}

function adjustPacotes(delta) {
    if (!currentSelectedDelivery) return;
    const newValue = (currentSelectedDelivery.pacotes || 1) + delta;
    if (newValue < 1) return;
    currentSelectedDelivery.pacotes = newValue;
    const pacotesSpan = document.getElementById('panelPacotesValue');
    pacotesSpan.innerText = newValue;
    if (newValue >= 2) {
        pacotesSpan.classList.add('pacotes-highlight');
    } else {
        pacotesSpan.classList.remove('pacotes-highlight');
    }
    const panel = document.getElementById('deliveryPanel');
    if (newValue >= 2) {
        panel.classList.add('red-bg');
    } else {
        panel.classList.remove('red-bg');
    }
    saveStorage();
    const marker = markersList.find(m => m.sequentialId === currentSelectedDelivery.sequentialId);
    if (marker) {
        updateMarkerIcon(marker, currentSelectedDelivery);
    }
    renderDeliveriesList();
    showToast(`Pacotes alterado para ${newValue}`);
}

function editObservation() {
    if (!currentSelectedDelivery) return;
    const currentObs = currentSelectedDelivery.notes || '';
    const newObs = prompt("Digite a observação para esta entrega:", currentObs);
    if (newObs !== null) {
        currentSelectedDelivery.notes = newObs;
        document.getElementById('panelObsText').innerText = newObs || 'Nenhuma observação';
        saveStorage();
        renderDeliveriesList();
        showToast("Observação salva");
    }
}

function editPhonesPanel() {
    if (!currentSelectedDelivery) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const phones = currentSelectedDelivery.telefones || [];
    let phoneListHtml = phones.map((p, i) => 
        `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
            <input type="text" class="edit-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
            <input type="tel" class="edit-phone-number" data-index="${i}" value="${escapeHtml(p.numero || '')}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
            <button class="remove-phone-modal" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
        </div>`
    ).join('');
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:500px; text-align:left;">
            <h3 style="margin-bottom:16px;">📞 Editar telefones</h3>
            <div id="phoneListModal">${phoneListHtml}</div>
            <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                <input type="text" id="newPhoneLabelModal" placeholder="Rótulo" style="flex:1; min-width:80px; padding:10px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <input type="tel" id="newPhoneModal" placeholder="(69) 99999-9999" style="flex:2; min-width:120px; padding:10px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <button id="addPhoneModalBtn" style="background:#3b82f6; color:white; border:none; border-radius:30px; padding:10px 16px; cursor:pointer;">Adicionar</button>
            </div>
            <div class="modal-buttons" style="margin-top:20px;">
                <button class="modal-confirm" id="savePhonesModal">Salvar</button>
                <button class="modal-cancel" id="cancelPhonesModal">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    function refreshPhoneList() {
        const list = overlay.querySelector('#phoneListModal');
        list.innerHTML = phones.map((p, i) => 
            `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                <input type="text" class="edit-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <input type="tel" class="edit-phone-number" data-index="${i}" value="${escapeHtml(p.numero || '')}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <button class="remove-phone-modal" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
            </div>`
        ).join('');
        list.querySelectorAll('.remove-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                phones.splice(idx, 1);
                refreshPhoneList();
            });
        });
        list.querySelectorAll('.edit-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].numero = this.value;
            });
        });
    }
    refreshPhoneList();

    overlay.querySelector('#addPhoneModalBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#newPhoneLabelModal');
        const numInput = overlay.querySelector('#newPhoneModal');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Digite um número", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número inválido", true);
        phones.push({ numero: formatted, label: label || '' });
        refreshPhoneList();
        labelInput.value = '';
        numInput.value = '';
    });

    overlay.querySelector('#savePhonesModal').addEventListener('click', () => {
        const list = overlay.querySelector('#phoneListModal');
        const labels = list.querySelectorAll('.edit-phone-label');
        const numbers = list.querySelectorAll('.edit-phone-number');
        const newPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    newPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        currentSelectedDelivery.telefones = newPhones;
        saveStorage();
        const phoneContainer = document.getElementById('panelPhone');
        if (newPhones.length) {
            phoneContainer.innerHTML = newPhones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
        } else {
            phoneContainer.innerText = 'Não informado';
        }
        renderDeliveriesList();
        syncAgendaByDelivery(currentSelectedDelivery);
        showToast("Telefones atualizados!");
        overlay.remove();
    });
    overlay.querySelector('#cancelPhonesModal').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#newPhoneModal').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#addPhoneModalBtn').click();
    });
}

// ========== WHATSAPP ==========
function sendWhatsApp(delivery) {
    if (!delivery.telefones || delivery.telefones.length === 0) {
        return showToast("Nenhum telefone cadastrado", true);
    }
    let phoneToUse = delivery.telefones[0];
    if (delivery.telefones.length > 1) {
        const options = delivery.telefones.map((p, i) => {
            const label = p.label ? p.label + ' ' : '';
            return `${i+1}: ${label}(${formatPhoneShort(p.numero)})`;
        }).join('\n');
        const choice = prompt(`Escolha o número para WhatsApp:\n${options}\n\nDigite o número (1 a ${delivery.telefones.length}):`, '1');
        if (choice === null) return;
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= delivery.telefones.length) {
            return showToast("Opção inválida", true);
        }
        phoneToUse = delivery.telefones[idx];
    }
    let msg = userProfile.mensagemPadrao
        .replace(/{nome}/g, phoneToUse.label || delivery.nome)
        .replace(/{id}/g, delivery.sequentialId)
        .replace(/{pacotes}/g, delivery.pacotes || 1)
        .replace(/{endereco}/g, delivery.endereco)
        .replace(/{obs}/g, delivery.notes ? `📝 Obs: ${delivery.notes}\n` : '');
    const link = getWhatsAppLink(phoneToUse.numero, msg);
    link ? window.open(link, '_blank') : showToast("Número inválido", true);
}

// ========== NOVA ENTREGA - TELEFONES ==========
function renderTempPhones() {
    const container = document.getElementById('phoneTagsContainer');
    container.innerHTML = tempPhones.map(p => {
        const label = p.label ? p.label + ': ' : '';
        return `<span class="phone-tag"><span class="phone-label">${escapeHtml(label)}</span>${escapeHtml(formatPhoneShort(p.numero))} <span class="remove-phone" data-phone="${escapeHtml(p.numero)}">&times;</span></span>`;
    }).join('');
    container.querySelectorAll('.remove-phone').forEach(el => {
        el.addEventListener('click', () => {
            const phone = el.dataset.phone;
            tempPhones = tempPhones.filter(p => p.numero !== phone);
            renderTempPhones();
        });
    });
}

// ========== RENDERIZAÇÃO DA LISTA DE ENTREGAS ==========
function renderDeliveriesList() {
    const container = document.getElementById("deliveriesList");
    if (!container) return;
    updateDeliveryStats();

    let filtered = routeFilter ? deliveries.filter(d => 
        d.nome.toLowerCase().includes(routeFilter) || 
        d.endereco.toLowerCase().includes(routeFilter)
    ) : [...deliveries];

    if (filtered.length === 0) {
        container.innerHTML = "<div class='empty-state'><i class='fas fa-truck'></i>Nenhuma entrega na rota</div>";
        return;
    }

    let html = "";
    filtered.forEach(del => {
        const statusLabel = { pendente: "Pendente", "em-rota": "Em rota", entregue: "Entregue", falhou: "Falhou" }[del.status];
        const statusClass = `status-${del.status}`;
        let phonesDisplay = '';
        if (del.telefones && del.telefones.length) {
            const shortPhones = del.telefones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
            phonesDisplay = `<div><i class="fas fa-phone-alt"></i> ${escapeHtml(shortPhones)}</div>`;
        }
        let whatsLink = '';
        if (del.telefones && del.telefones.length) {
            const firstPhone = del.telefones[0];
            whatsLink = `<a href="#" class="whatsapp-link" data-wa-phone="${getDigits(firstPhone.numero)}" data-wa-name="${escapeHtml(del.nome)}" data-wa-id="${del.sequentialId}" data-wa-pacotes="${del.pacotes || 1}" data-wa-endereco="${escapeHtml(del.endereco)}" data-wa-notes="${escapeHtml(del.notes || '')}"><i class="fab fa-whatsapp"></i> WhatsApp</a>`;
        }
        const agendaBadge = del.savedToAgenda ? `<span class="agenda-badge"><i class="fas fa-book"></i> Salvo na agenda</span>` : '';
        const photosHtml = del.photos && del.photos.length ? 
            `<div class="delivery-photos">` + 
            del.photos.slice(0, 3).map((photo, pidx) => `<img src="${photo}" class="delivery-photo" data-delivery-id="${del.id}" data-photo-index="${pidx}" alt="">`).join('') +
            (del.photos.length > 3 ? `<span style="font-size:0.7rem;">+${del.photos.length-3}</span>` : '') +
            `</div>` : '';

        const favBtn = `<button class="fav-btn ${del.favorito ? 'active' : ''}" data-id="${del.id}" title="${del.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"><i class="fas fa-star"></i></button>`;

        html += `<div class="delivery-item" data-id="${del.id}">
                    <div class="delivery-header">
                        <div class="delivery-info">
                            ${photosHtml}
                            <span class="delivery-id">ID: ${del.sequentialId}</span>
                            ${agendaBadge}
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${favBtn}
                            <strong>${escapeHtml(del.nome)}</strong>
                        </div>
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div><i class="fas fa-location-dot"></i> ${escapeHtml(del.endereco)}</div>
                    ${phonesDisplay}
                    ${whatsLink ? `<div>${whatsLink}</div>` : ''}
                    ${del.notes ? `<div><i class="fas fa-pen"></i> ${escapeHtml(del.notes)}</div>` : ''}
                    <div class="delivery-actions">
                        <select class="select-status" data-id="${del.id}"><option value="pendente" ${del.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="em-rota" ${del.status === 'em-rota' ? 'selected' : ''}>Em rota</option><option value="entregue" ${del.status === 'entregue' ? 'selected' : ''}>Entregue</option><option value="falhou" ${del.status === 'falhou' ? 'selected' : ''}>Falhou</option></select>
                        <button class="icon-btn edit-delivery" data-id="${del.id}"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn move-up" data-id="${del.id}"><i class="fas fa-arrow-up"></i></button>
                        <button class="icon-btn move-down" data-id="${del.id}"><i class="fas fa-arrow-down"></i></button>
                        <button class="icon-btn remove-del" data-id="${del.id}"><i class="fas fa-trash-can"></i></button>
                        <button class="icon-btn save-agenda" data-id="${del.id}"><i class="fas fa-bookmark"></i></button>
                    </div>
                </div>`;
    });
    container.innerHTML = html;
    attachDeliveryEvents();
    container.querySelectorAll('.delivery-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('button, a, select, input')) return;
            const delivery = deliveries.find(d => d.id === parseInt(item.dataset.id));
            if (!delivery) return;
            const marker = markersList.find(m => m.sequentialId === delivery.sequentialId);
            if (marker) highlightMarker(marker, delivery);
            openDeliveryPanel(delivery);
        });
    });
    container.querySelectorAll('.fav-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = parseInt(this.dataset.id);
            const delivery = deliveries.find(d => d.id === id);
            if (delivery) {
                delivery.favorito = !delivery.favorito;
                saveStorage();
                syncFavoritoToAgenda(delivery);
                renderDeliveriesList();
                showToast(delivery.favorito ? '⭐ Adicionado aos favoritos' : '⭐ Removido dos favoritos');
            }
        });
    });
    document.querySelectorAll('.delivery-photo').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const delivery = deliveries.find(d => d.id === parseInt(img.dataset.deliveryId));
            const index = parseInt(img.dataset.photoIndex) || 0;
            if (delivery && delivery.photos && delivery.photos.length) openGallery(delivery.photos, index);
        });
    });
}

function attachDeliveryEvents() {
    document.querySelectorAll(".select-status").forEach(sel => {
        sel.onchange = () => { let id = parseInt(sel.dataset.id); let d = deliveries.find(d => d.id === id); if (d) { const oldStatus = d.status; d.status = sel.value; saveStorage(); if (oldStatus !== d.status) { const marker = markersList.find(m => m.sequentialId === d.sequentialId); if (marker) updateMarkerIcon(marker, d); else rebuildMarkers(false); } updateDeliveryStats(); renderDeliveriesList(); } };
    });
    document.querySelectorAll(".edit-delivery").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let d = deliveries.find(d => d.id === id); if (d) showEditDeliveryModal(d, (updated) => editDeliveryInRoute(d, updated)); }; });
    document.querySelectorAll(".move-up").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let idx = deliveries.findIndex(d => d.id === id); if (idx > 0) { [deliveries[idx-1], deliveries[idx]] = [deliveries[idx], deliveries[idx-1]]; saveStorage(); renderDeliveriesList(); } }; });
    document.querySelectorAll(".move-down").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let idx = deliveries.findIndex(d => d.id === id); if (idx < deliveries.length-1) { [deliveries[idx+1], deliveries[idx]] = [deliveries[idx], deliveries[idx+1]]; saveStorage(); renderDeliveriesList(); } }; });
    document.querySelectorAll(".remove-del").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); const removed = deliveries.find(d => d.id === id);
                deliveries = deliveries.filter(d => d.id !== id); persistStorageNow(); renderDeliveriesList(); if (removed) removeMarkerById(removed.sequentialId); showToast("Entrega removida"); }; });
    document.querySelectorAll(".save-agenda").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let d = deliveries.find(d => d.id === id); if (d) saveToAgenda(d, true); }; });
    document.querySelectorAll("[data-wa-phone]").forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const id = parseInt(el.closest('.delivery-item').dataset.id);
            const delivery = deliveries.find(d => d.id === id);
            if (delivery) sendWhatsApp(delivery);
        });
    });
}

// ========== MODAL DE EDIÇÃO DE ENTREGA ==========
function showEditDeliveryModal(delivery, onSave) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    let currentPhotos = delivery.photos || [];
    let currentPhones = delivery.telefones || [];
    let currentPacotes = delivery.pacotes || 1;
    let photosHtml = '';
    if (currentPhotos.length) {
        photosHtml = `<div style="margin:10px 0;"><strong>Fotos atuais:</strong><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">` +
            currentPhotos.map((photo, idx) => `<div style="position:relative;"><img src="${photo}" style="width:60px; height:60px; border-radius:8px; object-fit:cover;"><button type="button" class="remove-existing-photo" data-index="${idx}" style="position:absolute; top:-8px; right:-8px; background:#dc2626; color:white; border-radius:50%; width:20px; height:20px; font-size:10px;">✕</button></div>`).join('') +
            `</div></div>`;
    }
    overlay.innerHTML = `<div class="modal-container" style="max-height:80vh; overflow-y:auto; max-width:550px;">
        <h3>✏️ Editar entrega</h3>
        <input id="editNome" class="edit-input" value="${escapeHtml(delivery.nome)}" placeholder="Nome">
        <input id="editEndereco" class="edit-input" value="${escapeHtml(delivery.endereco)}" placeholder="Endereço">
        <div style="margin-bottom:16px;">
            <label style="display:block; text-align:left; font-size:0.7rem; font-weight:600;">Telefones</label>
            <div id="editPhonesList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:6px;">
                ${currentPhones.map((p, i) => `
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <input type="text" class="edit-phone-label-modal" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                        <input type="tel" class="edit-phone-number-modal" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                        <button class="remove-edit-phone-modal" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" id="editNewPhoneLabel" placeholder="Rótulo" style="flex:1; min-width:80px; padding:8px 12px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <input type="tel" id="editNewPhone" placeholder="Adicionar telefone" style="flex:2; min-width:120px; padding:8px 12px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <button id="editAddPhoneBtn" style="background:#3b82f6; color:white; border:none; border-radius:30px; padding:8px 16px; cursor:pointer;">+</button>
            </div>
        </div>
        <label style="display:block; text-align:left; font-size:0.7rem; font-weight:600; margin-top:8px;">Quantidade de pacotes</label>
        <div class="modal-pacotes-control">
            <button type="button" id="modalPacotesMinus">−</button>
            <span id="modalPacotesValue">${currentPacotes}</span>
            <button type="button" id="modalPacotesPlus">+</button>
        </div>
        <select id="editStatus" class="edit-input">
            <option ${delivery.status === 'pendente' ? 'selected' : ''}>pendente</option>
            <option ${delivery.status === 'em-rota' ? 'selected' : ''}>em-rota</option>
            <option ${delivery.status === 'entregue' ? 'selected' : ''}>entregue</option>
            <option ${delivery.status === 'falhou' ? 'selected' : ''}>falhou</option>
        </select>
        <input id="editNotes" class="edit-input" value="${escapeHtml(delivery.notes || '')}" placeholder="Observações">
        ${photosHtml}
        <div style="display:flex; gap:12px; justify-content:center; margin:12px 0;">
            <button id="editCameraBtn" class="photo-btn"><i class="fas fa-camera"></i> Tirar foto</button>
            <button id="editGalleryBtn" class="photo-btn"><i class="fas fa-images"></i> Escolher da galeria</button>
        </div>
        <input type="file" id="editCameraInput" accept="image/*" capture="environment" style="display:none;">
        <input type="file" id="editGalleryInput" accept="image/*" multiple style="display:none;">
        <div id="editPhotosPreview" class="photos-preview"></div>
        <div class="modal-buttons"><button class="modal-confirm" id="saveEdit">Salvar</button><button class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    let editPhones = [...currentPhones];
    function renderEditPhones() {
        const list = overlay.querySelector('#editPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" class="edit-phone-label-modal" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <input type="tel" class="edit-phone-number-modal" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <button class="remove-edit-phone-modal" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditPhones();
            });
        });
        list.querySelectorAll('.edit-phone-label-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditPhones();

    overlay.querySelector('#editAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editNewPhoneLabel');
        const numInput = overlay.querySelector('#editNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Digite um número", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditPhones();
        labelInput.value = '';
        numInput.value = '';
    });
    overlay.querySelector('#editNewPhone').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#editAddPhoneBtn').click();
    });

    let newPhotosArray = [...currentPhotos];
    const cameraInput = overlay.querySelector('#editCameraInput');
    const galleryInput = overlay.querySelector('#editGalleryInput');
    const previewContainer = overlay.querySelector('#editPhotosPreview');
    function updateEditPreview() {
        previewContainer.innerHTML = '';
        newPhotosArray.forEach((photo, idx) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'preview-thumb';
            const removeBtn = document.createElement('div');
            removeBtn.className = 'remove-photo-btn';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = () => {
                newPhotosArray.splice(idx, 1);
                updateEditPreview();
            };
            div.appendChild(img);
            div.appendChild(removeBtn);
            previewContainer.appendChild(div);
        });
    }
    updateEditPreview();

    overlay.querySelector('#editCameraBtn').addEventListener('click', () => cameraInput.click());
    overlay.querySelector('#editGalleryBtn').addEventListener('click', () => galleryInput.click());
    cameraInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                newPhotosArray.push(ev.target.result);
                updateEditPreview();
            };
            reader.readAsDataURL(file);
            cameraInput.value = '';
        }
    });
    galleryInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                newPhotosArray.push(ev.target.result);
                updateEditPreview();
            };
            reader.readAsDataURL(file);
        });
        galleryInput.value = '';
    });

    let editPacotes = currentPacotes;
    function updatePacotesDisplay() { overlay.querySelector('#modalPacotesValue').innerText = editPacotes; }
    overlay.querySelector('#modalPacotesMinus').addEventListener('click', () => { if (editPacotes > 1) { editPacotes--; updatePacotesDisplay(); } });
    overlay.querySelector('#modalPacotesPlus').addEventListener('click', () => { editPacotes++; updatePacotesDisplay(); });

    overlay.querySelectorAll('.remove-existing-photo').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            newPhotosArray.splice(idx, 1);
            updateEditPreview();
        });
    });

    overlay.querySelector('#saveEdit').onclick = () => {
        const list = overlay.querySelector('#editPhonesList');
        const labels = list.querySelectorAll('.edit-phone-label-modal');
        const numbers = list.querySelectorAll('.edit-phone-number-modal');
        const finalPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    finalPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        let newNome = overlay.querySelector('#editNome').value.trim();
        let newEndereco = overlay.querySelector('#editEndereco').value.trim();
        let newStatus = overlay.querySelector('#editStatus').value;
        let newNotes = overlay.querySelector('#editNotes').value.trim();
        if (!newNome || !newEndereco) return showToast("Nome e endereço obrigatórios", true);
        onSave({ nome: newNome, endereco: newEndereco, telefones: finalPhones, pacotes: editPacotes, status: newStatus, photos: newPhotosArray, notes: newNotes });
        overlay.remove();
    };
    overlay.querySelector('#cancelEdit').onclick = () => overlay.remove();
}

function editDeliveryInRoute(delivery, updatedData) {
    let oldAddress = delivery.endereco;
    delivery.nome = updatedData.nome;
    delivery.endereco = updatedData.endereco;
    delivery.telefones = updatedData.telefones || [];
    delivery.pacotes = updatedData.pacotes;
    delivery.status = updatedData.status;
    if (updatedData.photos) delivery.photos = updatedData.photos;
    if (updatedData.notes !== undefined) delivery.notes = updatedData.notes;
    if (updatedData.endereco !== oldAddress) {
        geocodeAddressAndUpdate(delivery, updatedData.endereco, (success) => {
            if (!success) { delivery.endereco = oldAddress; saveStorage(); renderDeliveriesList(); }
        });
    } else { 
        saveStorage(); 
        const marker = markersList.find(m => m.sequentialId === delivery.sequentialId);
        if (marker) updateMarkerIcon(marker, delivery);
        else rebuildMarkers(false);
        updateDeliveryStats(); 
        renderDeliveriesList(); 
        syncAgendaByDelivery(delivery);
        showToast(`✅ ${delivery.sequentialId} atualizada!`); 
    }
}

// ========== AGENDA ==========
function renderAgendaList() {
    const container = document.getElementById("agendaList");
    let filtered = agendaFilter ? agenda.filter(i => i.nome.toLowerCase().includes(agendaFilter) || i.endereco.toLowerCase().includes(agendaFilter)) : agenda;
    if (filtered.length === 0) { container.innerHTML = "<div class='empty-state'><i class='fas fa-book'></i>Agenda vazia</div>"; return; }
    let html = "";
    filtered.forEach(item => {
        const photosHtml = item.photos && item.photos.length ? `<div><img src="${item.photos[0]}" class="agenda-photo" data-agenda-id="${item.agendaId}" alt=""></div>` : '';
        const phonesDisplay = item.telefones && item.telefones.length ? 
            item.telefones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ') : '—';
        const favoritoIcon = item.favorito ? '⭐ ' : '';
        html += `<div class="agenda-item" data-id="${item.agendaId}">
                    <div class="agenda-header">
                        <strong>${favoritoIcon}${escapeHtml(item.nome)}</strong>
                        <div><button class="icon-btn edit-agenda" data-id="${item.agendaId}"><i class="fas fa-edit"></i></button><button class="icon-btn remove-agenda" data-id="${item.agendaId}"><i class="fas fa-trash"></i></button></div>
                    </div>
                    <div>📍 ${escapeHtml(item.endereco)}</div>
                    <div>📦 ${item.pacotes || 1} pacote(s)</div>
                    <div>📞 ${escapeHtml(phonesDisplay)}</div>
                    ${item.notes ? `<div>📝 ${escapeHtml(item.notes)}</div>` : ''}
                    ${photosHtml}
                    <div class="agenda-actions"><button class="icon-btn add-agenda" data-id="${item.agendaId}"><i class="fas fa-plus-circle"></i> Adicionar à rota</button></div>
                </div>`;
    });
    container.innerHTML = html;
    attachAgendaEvents();
    document.querySelectorAll('.agenda-photo').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = agenda.find(a => a.agendaId === parseInt(img.dataset.agendaId));
            if (item && item.photos && item.photos.length) openGallery(item.photos, 0);
        });
    });
}

function attachAgendaEvents() {
    document.querySelectorAll(".add-agenda").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let item = agenda.find(i => i.agendaId === id); if (item) addAgendaToRoute(item); }; });
    document.querySelectorAll(".remove-agenda").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); agenda = agenda.filter(i => i.agendaId !== id); saveStorage(); renderAgendaList(); showToast("Item removido da agenda"); }; });
    document.querySelectorAll(".edit-agenda").forEach(btn => { btn.onclick = () => { let id = parseInt(btn.dataset.id); let item = agenda.find(i => i.agendaId === id); if (item) showEditAgendaModal(item, (updated) => editAgendaItem(id, updated)); }; });
}

function editAgendaItem(agendaId, updatedData) {
    let idx = agenda.findIndex(i => i.agendaId === agendaId);
    if (idx === -1) return;
    if (updatedData.endereco !== agenda[idx].endereco) {
        showToast("Atualizando coordenadas...");
        geocoder.geocode({ address: updatedData.endereco }, (res, stat) => {
            if (stat === "OK" && res[0]) {
                agenda[idx] = { ...agenda[idx], ...updatedData, lat: res[0].geometry.location.lat(), lng: res[0].geometry.location.lng() };
                saveStorage(); renderAgendaList(); showToast(`"${updatedData.nome}" atualizado!`);
            } else showToast("Endereço inválido!", true);
        });
    } else { agenda[idx] = { ...agenda[idx], ...updatedData }; saveStorage(); renderAgendaList(); showToast(`"${updatedData.nome}" atualizado!`); }
}

function showEditAgendaModal(item, onSave) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    let currentPhones = item.telefones || [];
    overlay.innerHTML = `<div class="modal-container">
        <h3>✏️ Editar na agenda</h3>
        <input id="editNome" class="edit-input" value="${escapeHtml(item.nome)}" placeholder="Nome">
        <input id="editEndereco" class="edit-input" value="${escapeHtml(item.endereco)}" placeholder="Endereço">
        <div style="margin-bottom:16px;">
            <label style="display:block; text-align:left; font-size:0.7rem; font-weight:600;">Telefones</label>
            <div id="editAgendaPhonesList" style="display:flex; flex-direction:column; gap:8px;">
                ${currentPhones.map((p, i) => `
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <input type="text" class="edit-agenda-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                        <input type="tel" class="edit-agenda-phone-number" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                        <button class="remove-edit-agenda-phone" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
                <input type="text" id="editAgendaNewPhoneLabel" placeholder="Rótulo" style="flex:1; min-width:80px; padding:8px 12px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <input type="tel" id="editAgendaNewPhone" placeholder="Adicionar telefone" style="flex:2; min-width:120px; padding:8px 12px; border-radius:30px; border:1.5px solid #e2e8f0;">
                <button id="editAgendaAddPhoneBtn" style="background:#3b82f6; color:white; border:none; border-radius:30px; padding:8px 16px; cursor:pointer;">+</button>
            </div>
        </div>
        <input id="editPacotes" class="edit-input" type="number" value="${item.pacotes || 1}">
        <input id="editNotes" class="edit-input" value="${escapeHtml(item.notes || '')}" placeholder="Observações">
        <div class="modal-buttons"><button class="modal-confirm" id="saveEdit">Salvar</button><button class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    let editPhones = [...currentPhones];
    function renderEditAgendaPhones() {
        const list = overlay.querySelector('#editAgendaPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" class="edit-agenda-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Rótulo" style="flex:1; min-width:80px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <input type="tel" class="edit-agenda-phone-number" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número" style="flex:2; min-width:120px; padding:6px 10px; border-radius:20px; border:1.5px solid #e2e8f0;">
                <button class="remove-edit-agenda-phone" data-index="${i}" style="background:#dc2626; color:white; border:none; border-radius:30px; padding:2px 10px; cursor:pointer;">✕</button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-agenda-phone').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditAgendaPhones();
            });
        });
        list.querySelectorAll('.edit-agenda-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-agenda-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditAgendaPhones();

    overlay.querySelector('#editAgendaAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editAgendaNewPhoneLabel');
        const numInput = overlay.querySelector('#editAgendaNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Digite um número", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditAgendaPhones();
        labelInput.value = '';
        numInput.value = '';
    });

    document.getElementById('saveEdit').onclick = () => {
        const list = overlay.querySelector('#editAgendaPhonesList');
        const labels = list.querySelectorAll('.edit-agenda-phone-label');
        const numbers = list.querySelectorAll('.edit-agenda-phone-number');
        const finalPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    finalPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        let newNome = document.getElementById('editNome').value.trim();
        let newEndereco = document.getElementById('editEndereco').value.trim();
        let newPacotes = parseInt(document.getElementById('editPacotes').value) || 1;
        let newNotes = document.getElementById('editNotes').value.trim();
        if (!newNome || !newEndereco) return showToast("Nome e endereço obrigatórios", true);
        onSave({ nome: newNome, endereco: newEndereco, telefones: finalPhones, pacotes: newPacotes, notes: newNotes });
        overlay.remove();
    };
    document.getElementById('cancelEdit').onclick = () => overlay.remove();
}

// ========== ADICIONAR DA AGENDA PARA A ROTA (PERMITIDO) ==========
function addAgendaToRoute(item) {
    // Verifica se o endereço já está na rota
    if (deliveries.some(d => d.endereco.toLowerCase() === item.endereco.toLowerCase())) {
        showToast("Endereço já está na rota!", true);
        return;
    }
    // Permite adicionar à rota mesmo que o endereço esteja na agenda
    const newId = getSequentialId(nextSequenceNumber);
    deliveries.push({ 
        id: Date.now(), 
        sequentialId: newId, 
        nome: item.nome, 
        endereco: item.endereco, 
        telefones: item.telefones || [], 
        pacotes: item.pacotes || 1, 
        status: "pendente", 
        lat: item.lat, 
        lng: item.lng, 
        savedToAgenda: false, 
        photos: [...(item.photos || [])], 
        notes: item.notes || '',
        favorito: item.favorito || false
    });
    nextSequenceNumber++; 
    persistStorageNow();
    renderDeliveriesList();
    upsertMarker(deliveries[deliveries.length - 1]);
    updateLastIdDisplay(newId);
    switchSidebarTab('rota');
    showToast(`✅ ${item.nome} adicionado à rota (ID ${newId})`);
}

// ========== SALVAR NA AGENDA ==========
function saveToAgenda(del, fromCard = false) {
    const duplicate = agenda.some(item => item.endereco.toLowerCase() === del.endereco.toLowerCase());
    if (duplicate) {
        showToast(`Endereço "${del.endereco}" já existe na agenda`, true);
        return false;
    }
    agenda.push({ 
        agendaId: nextAgendaId++, 
        nome: del.nome, 
        endereco: del.endereco, 
        telefones: del.telefones || [], 
        pacotes: del.pacotes, 
        lat: del.lat, 
        lng: del.lng, 
        photos: [...(del.photos || [])], 
        notes: del.notes || '',
        favorito: del.favorito || false
    });
    if (!del.savedToAgenda) { del.savedToAgenda = true; saveStorage(); renderDeliveriesList(); }
    saveStorage(); renderAgendaList();
    showToast(`📚 "${del.nome}" salvo na agenda!`);
    return true;
}

function copyFromOtherRoute() {
    if (deliveries.length === 0) return showToast("Nenhuma entrega na rota", true);
    let count = 0;
    deliveries.forEach(del => { if (saveToAgenda(del, false)) count++; });
    showToast(`${count} novas paradas adicionadas à biblioteca`);
}

// ========== BACKUP E RESTORE ==========
function backupAgenda() {
    if (agenda.length === 0) { showToast("Agenda vazia", true); return; }
    const data = { agenda, nextAgendaId };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `agenda_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    showToast("Backup da agenda realizado!");
}

function restoreAgenda(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.agenda) throw new Error("Formato inválido");
            if (!confirm("Isso substituirá toda a agenda atual. Continuar?")) return;
            agenda = data.agenda;
            nextAgendaId = data.nextAgendaId || 1;
            agenda.forEach(a => { migrateTelefones(a); migrateFavorito(a); if (a.pacotes === undefined) a.pacotes = 1; if (!a.photos) a.photos = []; if (a.notes === undefined) a.notes = ''; });
            persistStorageNow();
            renderAgendaList();
            showToast("Agenda restaurada com sucesso!");
        } catch (err) {
            showToast("Erro ao restaurar agenda: arquivo inválido", true);
        }
    };
    reader.readAsText(file);
}

function backupData() {
    persistStorageNow();
    const data = { deliveries, agenda, nextSequenceNumber, nextAgendaId, userProfile };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rotaflow_backup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    showToast("Backup completo realizado!");
}

function restoreData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.deliveries || !data.agenda) throw new Error("Formato inválido");
            deliveries = data.deliveries;
            agenda = data.agenda;
            nextSequenceNumber = data.nextSequenceNumber || 1;
            nextAgendaId = data.nextAgendaId || 1;
            if (data.userProfile) userProfile = data.userProfile;
            persistStorageNow();
            renderDeliveriesList();
            renderAgendaList();
            rebuildMarkers(false);
            updateLastIdDisplay(deliveries.length ? deliveries[deliveries.length-1].sequentialId : null);
            showToast("Dados restaurados com sucesso!");
        } catch (err) {
            showToast("Erro ao restaurar: arquivo inválido", true);
        }
    };
    reader.readAsText(file);
}

// ========== LIMPAR ROTA ==========
function clearRoute() {
    if (confirm("Limpar todas as entregas?")) {
        deliveries = [];
        nextSequenceNumber = 1;
        saveStorage();
        renderDeliveriesList();
        rebuildMarkers(false);
        updateLastIdDisplay(null);
        showToast("Rota limpa");
    }
}

function toggleSidebar() { document.getElementById("appContainer").classList.toggle("sidebar-hidden"); setTimeout(() => { if (map) google.maps.event.trigger(map, 'resize'); }, 200); }

// ========== PERFIL ==========
function showProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:450px; text-align:left;">
            <h3 style="text-align:center; margin-bottom:20px;"><i class="fas fa-user-cog"></i> Perfil</h3>
            <div class="form-group">
                <label>Nome do motorista</label>
                <input type="text" id="profileMotorista" value="${escapeHtml(userProfile.motorista)}" class="edit-input">
            </div>
            <div class="form-group">
                <label>Mensagem padrão do WhatsApp</label>
                <textarea id="profileMensagem" class="edit-input" rows="4" style="resize:vertical;">${escapeHtml(userProfile.mensagemPadrao)}</textarea>
                <span style="font-size:0.7rem; color:#64748b;">Use {nome}, {id}, {pacotes}, {endereco}, {obs}</span>
            </div>
            <div class="modal-buttons">
                <button class="modal-confirm" id="saveProfileBtn">Salvar</button>
                <button class="modal-cancel" id="cancelProfileBtn">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('saveProfileBtn').onclick = () => {
        userProfile.motorista = document.getElementById('profileMotorista').value.trim() || 'Motorista';
        userProfile.mensagemPadrao = document.getElementById('profileMensagem').value.trim() || userProfile.mensagemPadrao;
        saveStorage();
        showToast("Perfil salvo!");
        overlay.remove();
    };
    document.getElementById('cancelProfileBtn').onclick = () => overlay.remove();
}

// ========== SUGESTÕES (SEM BADGE "NA AGENDA") ==========
function initNameSuggestions() {
    const input = document.getElementById('customerName');
    const suggestionsDiv = document.getElementById('nameSuggestions');
    input.addEventListener('input', debounce(function() {
        const query = this.value.trim().toLowerCase();
        if (query.length < 1) { suggestionsDiv.style.display = 'none'; return; }

        let agendaMatches = agenda.filter(item => 
            item.nome.toLowerCase().includes(query) || 
            item.endereco.toLowerCase().includes(query)
        );

        let routeMatches = deliveries.filter(del => 
            del.nome.toLowerCase().includes(query) || 
            del.endereco.toLowerCase().includes(query)
        );

        let combined = [];

        routeMatches.forEach(del => {
            combined.push({
                type: 'route',
                item: del,
                nome: del.nome,
                endereco: del.endereco,
                telefones: del.telefones || [],
                pacotes: del.pacotes || 1,
                notes: del.notes || '',
                favorito: del.favorito || false,
                sequentialId: del.sequentialId,
                id: del.id
            });
        });

        agendaMatches.forEach(item => {
            const isInRoute = deliveries.some(d => d.endereco.toLowerCase() === item.endereco.toLowerCase());
            combined.push({
                type: 'agenda',
                item: item,
                nome: item.nome,
                endereco: item.endereco,
                telefones: item.telefones || [],
                pacotes: item.pacotes || 1,
                notes: item.notes || '',
                favorito: item.favorito || false,
                agendaId: item.agendaId,
                isInRoute: isInRoute
            });
        });

        combined.sort((a, b) => {
            if (a.favorito && !b.favorito) return -1;
            if (!a.favorito && b.favorito) return 1;
            if (a.type === 'route' && b.type !== 'route') return -1;
            if (a.type !== 'route' && b.type === 'route') return 1;
            return 0;
        });

        const unique = [];
        const seen = new Set();
        combined.forEach(item => {
            const key = item.endereco.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            } else {
                const existingIndex = unique.findIndex(u => u.endereco.toLowerCase() === key);
                if (existingIndex !== -1 && item.type === 'route') {
                    unique[existingIndex] = item;
                }
            }
        });

        const limited = unique.slice(0, 10);
        if (limited.length === 0) { suggestionsDiv.style.display = 'none'; return; }

        let html = '';
        limited.forEach(item => {
            const isRoute = item.type === 'route';
            const isAgendaInRoute = item.type === 'agenda' && item.isInRoute;
            const matchedBy = (item.nome.toLowerCase().includes(query) ? 'nome' : 'endereço');
            const icon = matchedBy === 'nome' ? 'fa-user' : 'fa-location-dot';
            const phones = (item.telefones || []).map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
            const favoritoIcon = item.favorito ? '⭐ ' : '';

            let badgeHtml = '';
            if (isRoute) {
                badgeHtml = `<span class="suggestion-badge route">🚀 ID ${item.sequentialId}</span>`;
            } else if (isAgendaInRoute) {
                const routeItem = deliveries.find(d => d.endereco.toLowerCase() === item.endereco.toLowerCase());
                badgeHtml = routeItem ? `<span class="suggestion-badge route">🚀 Na rota (ID ${routeItem.sequentialId})</span>` : `<span class="suggestion-badge route">🚀 Na rota</span>`;
            } else {
                // SEM BADGE para itens da agenda não rota
                badgeHtml = '';
            }

            const routeClass = isRoute ? 'suggestion-route' : 'suggestion-agenda';
            const pacotesVal = item.pacotes || 1;
            const dataIdAttr = isRoute ? `data-id="${item.id}"` : '';

            let actionBtnHtml;
            if (isRoute) {
                actionBtnHtml = `<button class="suggestion-btn-save" data-action="save" data-id="${item.id}" data-pacotes="${pacotesVal}"><i class="fas fa-save"></i> Salvar</button>`;
            } else if (isAgendaInRoute) {
                actionBtnHtml = `<button class="suggestion-btn-add disabled" disabled>🔒 Na rota</button>`;
            } else {
                // Item da agenda que NÃO está na rota => botão "+ Rota" habilitado
                actionBtnHtml = `<button class="suggestion-btn-add" data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}"><i class="fas fa-plus"></i> Rota</button>`;
            }

            html += `<div class="suggestion-item ${routeClass}" ${dataIdAttr} data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}" data-isroute="${isRoute}">
                        <div class="suggestion-info">
                            <div><i class="fas ${icon}" style="color:#3b82f6; margin-right:8px;"></i><strong>${favoritoIcon}${escapeHtml(item.nome)}</strong> ${badgeHtml}</div>
                            <div style="font-size:0.7rem; color:#475569;">${escapeHtml(item.endereco)} ${phones ? `<span style="margin-left:6px;">📞 ${escapeHtml(phones)}</span>` : ''}</div>
                            <div style="font-size:0.65rem; color:#3b82f6;">${matchedBy}</div>
                        </div>
                        <div class="suggestion-actions">
                            <div class="suggestion-pacotes-control" data-pacotes="${pacotesVal}">
                                <button class="suggestion-pacotes-minus">−</button>
                                <span class="suggestion-pacotes-value">${pacotesVal}</span>
                                <button class="suggestion-pacotes-plus">+</button>
                            </div>
                            ${actionBtnHtml}
                        </div>
                    </div>`;
        });
        suggestionsDiv.innerHTML = html;
        suggestionsDiv.style.display = 'block';

        document.querySelectorAll('.suggestion-pacotes-control').forEach(control => {
            const minus = control.querySelector('.suggestion-pacotes-minus');
            const plus = control.querySelector('.suggestion-pacotes-plus');
            const valueSpan = control.querySelector('.suggestion-pacotes-value');
            const itemDiv = control.closest('.suggestion-item');
            const actionBtn = itemDiv.querySelector('.suggestion-btn-save, .suggestion-btn-add');

            let currentVal = parseInt(control.dataset.pacotes) || 1;

            function updateValue(newVal) {
                if (newVal < 1) newVal = 1;
                currentVal = newVal;
                valueSpan.textContent = currentVal;
                control.dataset.pacotes = currentVal;
                itemDiv.dataset.pacotes = currentVal;
                if (actionBtn) actionBtn.dataset.pacotes = currentVal;
            }

            minus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal - 1);
            });
            plus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal + 1);
            });
        });

        document.querySelectorAll('#nameSuggestions .suggestion-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.suggestion-btn-save') || e.target.closest('.suggestion-btn-add') || e.target.closest('.suggestion-pacotes-control')) return;
                const name = el.dataset.name;
                const address = el.dataset.address;
                const phones = JSON.parse(el.dataset.phones || '[]');
                const pacotes = parseInt(el.dataset.pacotes) || 1;
                const notes = el.dataset.notes || '';

                document.getElementById('customerName').value = name;
                document.getElementById('address').value = address;
                tempPhones = phones;
                renderTempPhones();
                document.getElementById('pacotes').value = pacotes;
                suggestionsDiv.style.display = 'none';
                checkAddressDuplicate();
            });
        });

        document.querySelectorAll('.suggestion-btn-save').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const delivery = deliveries.find(d => d.id === id);
                if (delivery) {
                    delivery.pacotes = pacotes;
                    saveStorage();
                    renderDeliveriesList();
                    const marker = markersList.find(m => m.sequentialId === delivery.sequentialId);
                    if (marker) updateMarkerIcon(marker, delivery);
                    updateDeliveryStats();
                    showToast(`✅ ${delivery.sequentialId} pacotes atualizados para ${pacotes}`);
                    suggestionsDiv.style.display = 'none';
                } else {
                    showToast("Entrega não encontrada", true);
                }
            });
        });

        document.querySelectorAll('.suggestion-btn-add:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                const address = btn.dataset.address;
                const phones = JSON.parse(btn.dataset.phones || '[]');
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const notes = btn.dataset.notes || '';
                // Verifica se já está na rota
                if (deliveries.some(d => d.endereco.toLowerCase() === address.toLowerCase())) {
                    showToast("Endereço já está na rota!", true);
                    suggestionsDiv.style.display = 'none';
                    return;
                }
                // Permite adicionar mesmo que esteja na agenda
                tempPhones = phones;
                renderTempPhones();
                addDeliveryDirect(name, address, phones, pacotes, notes);
                suggestionsDiv.style.display = 'none';
            });
        });
    }, 180));
    document.addEventListener('click', (e) => {
        if (e.target !== input && !suggestionsDiv.contains(e.target)) suggestionsDiv.style.display = 'none';
    });
}

// ========== ADICIONAR ENTREGA DIRETO (PERMITE AGENDA) ==========
function addDeliveryDirect(nome, endereco, telefones, pacotes, notes) {
    if (!nome || !endereco) { showToast("Nome e endereço obrigatórios", true); return; }

    // Verifica se já está na rota
    if (deliveries.some(d => d.endereco.toLowerCase() === endereco.toLowerCase())) {
        showToast("Endereço já está na rota!", true);
        return;
    }

    // Permite adicionar mesmo que esteja na agenda (não verifica agenda)

    const known = agenda.find(a => a.endereco.toLowerCase() === endereco.toLowerCase());
    const finish = (lat, lng) => {
        let seqId = getSequentialId(nextSequenceNumber);
        let newDelivery = { 
            id: Date.now(), 
            sequentialId: seqId, 
            nome, 
            endereco, 
            telefones: telefones || [], 
            pacotes, 
            status: "pendente", 
            lat, 
            lng, 
            savedToAgenda: !!known, 
            photos: known ? [...(known.photos || [])] : [], 
            notes: notes || '',
            favorito: known ? !!known.favorito : false
        };
        deliveries.push(newDelivery);
        nextSequenceNumber++;
        persistStorageNow(); renderDeliveriesList(); upsertMarker(newDelivery);
        updateLastIdDisplay(seqId);
        showToast(`✅ Entrega ${seqId} adicionada à rota!`, false);
        if (deliveries.length === 1) centerMapOnMarkers();
        clearForm();
    };
    if (known && known.lat && known.lng) {
        finish(known.lat, known.lng);
        return;
    }
    showToast("Buscando coordenadas...");
    geocoder.geocode({ address: endereco }, (res, stat) => {
        let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
        if (stat === "OK" && res[0]) {
            lat = res[0].geometry.location.lat();
            lng = res[0].geometry.location.lng();
        } else {
            showToast("Endereço não encontrado, usando coordenadas do centro", true);
        }
        finish(lat, lng);
    });
}

// ========== MAPA E INICIALIZAÇÃO ==========
function initMap() {
    map = new google.maps.Map(document.getElementById("map"), { 
        center: PORTO_VELHO_CENTER, 
        zoom: 12, 
        mapTypeControl: false,
        fullscreenControl: true, 
        gestureHandling: "greedy", 
        rotateControl: false,
        styles: mapStyle
    });
    geocoder = new google.maps.Geocoder();
    const addressInput = document.getElementById("address");
    autocomplete = new google.maps.places.Autocomplete(addressInput, { 
        componentRestrictions: { country: "br" }, 
        fields: ["formatted_address", "geometry"], 
        types: ['address'], 
        location: PORTO_VELHO_CENTER, 
        radius: PORTO_VELHO_RADIUS, 
        strictBounds: false 
    });
    autocomplete.addListener("place_changed", () => { const place = autocomplete.getPlace(); if (place && place.formatted_address) addressInput.value = place.formatted_address; });
    loadStorage();
    initNameSuggestions();
    setupNewDeliveryPhoneUI();

    addressInput.addEventListener('input', function() {
        clearTimeout(duplicateCheckTimer);
        duplicateCheckTimer = setTimeout(checkAddressDuplicate, 300);
    });

    document.getElementById('closeGalleryBtn').addEventListener('click', closeGallery);
    document.getElementById('prevPhotoBtn').addEventListener('click', prevPhoto);
    document.getElementById('nextPhotoBtn').addEventListener('click', nextPhoto);
    document.getElementById('fullscreenGallery').addEventListener('click', (e) => { if (e.target === document.getElementById('fullscreenGallery')) closeGallery(); });
    document.getElementById('closePanelBtn').addEventListener('click', closeDeliveryPanel);
    document.getElementById('panelPacotesPlus').addEventListener('click', () => adjustPacotes(1));
    document.getElementById('panelPacotesMinus').addEventListener('click', () => adjustPacotes(-1));
    document.getElementById('editObsBtn').addEventListener('click', editObservation);
    document.getElementById('editPhoneBtn').addEventListener('click', editPhonesPanel);

    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    document.getElementById('backupBtn').addEventListener('click', backupData);
    document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', (e) => {
        if (e.target.files.length) {
            restoreData(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('backupAgendaBtn').addEventListener('click', backupAgenda);
    document.getElementById('restoreAgendaBtn').addEventListener('click', () => document.getElementById('restoreAgendaInput').click());
    document.getElementById('restoreAgendaInput').addEventListener('change', (e) => {
        if (e.target.files.length) {
            restoreAgenda(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);
    document.getElementById('toggleSidebarBtn').addEventListener('click', toggleSidebar);
    document.getElementById('copyFromRouteBtn').addEventListener('click', copyFromOtherRoute);

    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
    });
    document.getElementById('mapLoading')?.classList.add('hidden');

    document.addEventListener('keydown', (e) => {
        const gallery = document.getElementById('fullscreenGallery');
        const galleryOpen = gallery && gallery.style.display === 'flex';
        if (e.key === 'Escape') {
            if (galleryOpen) closeGallery();
            else closeDeliveryPanel();
        }
        if (galleryOpen && e.key === 'ArrowRight') nextPhoto();
        if (galleryOpen && e.key === 'ArrowLeft') prevPhoto();
    });
}

function setupNewDeliveryPhoneUI() {
    const addBtn = document.getElementById('addPhoneBtn');
    const numInput = document.getElementById('newPhoneInput');
    const labelInput = document.getElementById('newPhoneLabel');
    addBtn.addEventListener('click', () => {
        const numero = numInput.value.trim();
        const label = labelInput.value.trim();
        if (!numero) return showToast("Digite um número", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número inválido", true);
        tempPhones.push({ numero: formatted, label: label || '' });
        renderTempPhones();
        numInput.value = '';
        labelInput.value = '';
    });
    numInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    renderTempPhones();
}

// ========== GALERIA ==========
let currentGalleryPhotos = null, currentGalleryIndex = 0;
function openGallery(photos, index) {
    const gallery = document.getElementById('fullscreenGallery');
    const img = document.getElementById('galleryImg');
    if (!photos || photos.length === 0) return;
    currentGalleryPhotos = photos;
    currentGalleryIndex = index;
    img.src = photos[index];
    gallery.style.display = 'flex';
}
function closeGallery() { document.getElementById('fullscreenGallery').style.display = 'none'; currentGalleryPhotos = null; }
function nextPhoto() { if (currentGalleryPhotos && currentGalleryIndex < currentGalleryPhotos.length - 1) { currentGalleryIndex++; document.getElementById('galleryImg').src = currentGalleryPhotos[currentGalleryIndex]; } }
function prevPhoto() { if (currentGalleryPhotos && currentGalleryIndex > 0) { currentGalleryIndex--; document.getElementById('galleryImg').src = currentGalleryPhotos[currentGalleryIndex]; } }

function geocodeAddressAndUpdate(delivery, newAddress, callback) {
    if (newAddress === delivery.endereco) { callback?.(true); return; }
    showToast("Buscando coordenadas...");
    geocoder.geocode({ address: newAddress }, (res, stat) => {
        if (stat === "OK" && res[0]) {
            delivery.lat = res[0].geometry.location.lat();
            delivery.lng = res[0].geometry.location.lng();
            delivery.endereco = newAddress;
            saveStorage();
            const marker = markersList.find(m => m.sequentialId === delivery.sequentialId);
            if (marker) { marker.setPosition({ lat: delivery.lat, lng: delivery.lng }); updateMarkerIcon(marker, delivery); } else { rebuildMarkers(false); }
            renderDeliveriesList();
            showToast("Endereço atualizado!");
            callback?.(true);
        } else { showToast("Endereço inválido!", true); callback?.(false); }
    });
}

function markDelivered(id) {
    let d = deliveries.find(d => d.id === id);
    if (d && d.status !== 'entregue') {
        d.status = 'entregue';
        saveStorage();
        const marker = markersList.find(m => m.sequentialId === d.sequentialId);
        if (marker) updateMarkerIcon(marker, d);
        else rebuildMarkers(false);
        updateDeliveryStats();
        renderDeliveriesList();
        showToast(`✅ ${d.sequentialId} entregue!`);
        if (currentSelectedDelivery && currentSelectedDelivery.id === id) closeDeliveryPanel();
    }
}

function undoDelivered(id) {
    let d = deliveries.find(d => d.id === id);
    if (d && d.status === 'entregue') {
        d.status = 'pendente';
        saveStorage();
        const marker = markersList.find(m => m.sequentialId === d.sequentialId);
        if (marker) updateMarkerIcon(marker, d);
        else rebuildMarkers(false);
        updateDeliveryStats();
        renderDeliveriesList();
        showToast(`↩️ Entrega ${d.sequentialId} reaberta (pendente)`);
        if (currentSelectedDelivery && currentSelectedDelivery.id === id) closeDeliveryPanel();
    }
}

// ========== EVENTO DO BOTÃO "ADICIONAR ENTREGA" (FORMULÁRIO MANUAL) ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("routeSearchInput").addEventListener("input", debounce((e) => { routeFilter = e.target.value.toLowerCase(); renderDeliveriesList(); }, 150));
    document.getElementById("agendaSearchInput").addEventListener("input", debounce((e) => { agendaFilter = e.target.value.toLowerCase(); renderAgendaList(); }, 150));

    document.getElementById("addDeliveryBtn").addEventListener('click', function() {
        let nome = document.getElementById("customerName").value.trim();
        let end = document.getElementById("address").value.trim();
        let pacotes = parseInt(document.getElementById("pacotes").value) || 1;
        let saveAgenda = document.getElementById("saveToAgendaCheckbox").checked;
        let telefones = [...tempPhones];
        let notes = "";
        if (!nome || !end) { showToast("Preencha nome e endereço", true); return; }
        if (!geocoder) { showToast("Aguarde o mapa carregar", true); return; }

        // Verifica se o endereço já está na rota
        if (deliveries.some(d => d.endereco.toLowerCase() === end.toLowerCase())) {
            showToast("Endereço já está na rota!", true);
            return;
        }

        // *** BLOQUEIA SE O ENDEREÇO JÁ ESTIVER NA AGENDA ***
        if (agenda.some(item => item.endereco.toLowerCase() === end.toLowerCase())) {
            showToast("Endereço já está na agenda. Para adicionar à rota, use o botão '+ Rota' na lista da agenda.", true);
            return;
        }

        showToast("Buscando coordenadas...");
        geocoder.geocode({ address: end }, (res, stat) => {
            let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
            if (stat === "OK" && res[0]) {
                lat = res[0].geometry.location.lat();
                lng = res[0].geometry.location.lng();
            } else {
                showToast("Endereço não encontrado, usando coordenadas do centro", true);
            }
            let seqId = getSequentialId(nextSequenceNumber);
            let newDelivery = { 
                id: Date.now(), 
                sequentialId: seqId, 
                nome, 
                endereco: end, 
                telefones, 
                pacotes, 
                status: "pendente", 
                lat, 
                lng, 
                savedToAgenda: false, 
                photos: [], 
                notes: notes,
                favorito: false
            };
            deliveries.push(newDelivery); nextSequenceNumber++;
            persistStorageNow(); renderDeliveriesList(); upsertMarker(newDelivery);
            updateLastIdDisplay(seqId);
            switchSidebarTab('rota');
            if (saveAgenda) {
                const agendaDup = agenda.some(item => item.endereco.toLowerCase() === end.toLowerCase());
                if (agendaDup) {
                    showToast(`✅ Entrega ${seqId} adicionada! (Endereço já existe na agenda)`, false);
                } else {
                    agenda.push({ agendaId: nextAgendaId++, nome, endereco: end, telefones, pacotes, lat, lng, photos: [], notes: notes });
                    newDelivery.savedToAgenda = true;
                    saveStorage();
                    renderAgendaList();
                    renderDeliveriesList();
                    showToast(`✅ Entrega ${seqId} adicionada à rota e salva na agenda!`, false);
                }
            } else {
                showToast(`✅ Entrega ${seqId} adicionada à rota!`, false);
            }
            if (deliveries.length === 1) centerMapOnMarkers();
            clearForm();
        });
    });
});


window.initMap = initMap;
window.addEventListener('beforeunload', persistStorageNow);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

(function () {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installBtn');
        if (!installBtn) return;
        installBtn.style.display = 'flex';
        installBtn.onclick = () => {
            installBtn.style.display = 'none';
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
        };
    });
})();

