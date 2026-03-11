document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map', {
        zoomControl: false,
        minZoom: 4,
        maxZoom: 18,
        zoomSnap: 0.25,      // Permite níveis fracionados (como um slider: 4.25, 4.5, etc)
        zoomDelta: 0.25,     // Menor fator de passo no botão +/- (era 1.0)
        wheelPxPerZoomLevel: 100, // Rolagem do mouse também mais suave
        maxBounds: [
            [5.27, -73.98], // North West corner of Brazil approx
            [-33.75, -34.79] // South East corner of Brazil approx
        ]
    }).setView([-14.235, -51.925], 5); // O número '5' é o zoom padrão exato que você achou melhor

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    let stateLayer = null;
    let cityGeoLayer = null; // Camada pros polígonos das cidades
    let cityMarkersLayer = L.layerGroup().addTo(map); // Camada para os selos numéricos por cidade
    let rawData = [];
    let stateTotals = {}; 
    let stateMarkers = L.layerGroup().addTo(map);
    let currentActiveState = null;

    // Estado dos Filtros Globais
    let currentFilters = {
        warranty: 'all', // 'all', 'active', 'expired'
        models: []       // Array de strings dos modelos selecionados
    };

    const btnBackBrasil = document.getElementById('btnBackBrasil');
    btnBackBrasil.addEventListener('click', () => {
        resetToNationalView();
    });

    const infoPanel = document.getElementById('infoPanel');
    const infoPanelContent = document.getElementById('infoPanelContent');
    const btnClosePanel = document.getElementById('btnClosePanel');
    const btnThemeToggle = document.getElementById('btnThemeToggle');

    // Módulo de Tema Escuro / Claro
    const currentTheme = localStorage.getItem('theme') ? localStorage.getItem('theme') : 'dark';
    if (currentTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }

    btnThemeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'light') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
        
        // Redesenhar o mapa pra aplicar cores dinâmicas
        if (stateLayer) {
            stateLayer.eachLayer(layer => {
                if (currentActiveState === layer) {
                    layer.setStyle(getActiveStyle());
                } else {
                    layer.setStyle(getFeatureStyle(layer.feature));
                }
            });
        }
        
        // Redesenhar cidades se estiver logado em um estado
        if (currentActiveState && cityGeoLayer) {
            renderCityGeoJSON(currentActiveState.feature.properties.sigla);
        }
    });

    btnClosePanel.addEventListener('click', () => {
        infoPanel.classList.add('hidden');
    });

    // Elementos de Filtro e Autenticação
    const filterWarranty = document.getElementById('filterWarranty');
    const btnAdminHistory = document.getElementById('btnAdminHistory');
    const btnLogout = document.getElementById('btnLogout');
    const loginOverlay = document.getElementById('loginOverlay');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');
    const loginError = document.getElementById('loginError');
    const adminModal = document.getElementById('adminModal');
    const btnCloseAdmin = document.getElementById('btnCloseAdmin');
    const historyTableBody = document.getElementById('historyTableBody');

    let currentUser = null;

    function checkAuth() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = storedUser;
            loginOverlay.classList.add('hidden');
            btnLogout.classList.remove('hidden');
            if (currentUser === 'admin') {
                btnAdminHistory.classList.remove('hidden');
            } else {
                btnAdminHistory.classList.add('hidden');
            }
        } else {
            loginOverlay.classList.remove('hidden');
            btnLogout.classList.add('hidden');
            btnAdminHistory.classList.add('hidden');
        }
    }

    function recordHistory(user, action) {
        let history = JSON.parse(localStorage.getItem('userHistory') || '[]');
        history.unshift({
            user: user,
            action: action,
            date: new Date().toLocaleString('pt-BR')
        });
        if(history.length > 200) history = history.slice(0, 200);
        localStorage.setItem('userHistory', JSON.stringify(history));
    }

    btnLoginSubmit.addEventListener('click', () => {
        const u = loginUsername.value.trim();
        const p = loginPassword.value.trim();

        // Senhas fixas pro exemplo
        if ((u === 'admin' && p === 'admin') || (u === 'user' && p === 'user')) {
            localStorage.setItem('currentUser', u);
            recordHistory(u, 'LOGIN');
            loginError.classList.add('hidden');
            loginUsername.value = '';
            loginPassword.value = '';
            checkAuth();
        } else {
            loginError.classList.remove('hidden');
        }
    });

    // Permitir login pressionando Enter no campo de senha
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnLoginSubmit.click();
        }
    });

    btnLogout.addEventListener('click', () => {
        if(currentUser) {
            recordHistory(currentUser, 'LOGOUT');
        }
        localStorage.removeItem('currentUser');
        currentUser = null;
        checkAuth();
    });

    btnAdminHistory.addEventListener('click', () => {
        const history = JSON.parse(localStorage.getItem('userHistory') || '[]');
        historyTableBody.innerHTML = history.map(h => `
            <tr>
                <td><strong>${h.user}</strong></td>
                <td><span class="${h.action === 'LOGIN' ? 'tag-login' : 'tag-logout'}">${h.action}</span></td>
                <td>${h.date}</td>
            </tr>
        `).join('');
        adminModal.classList.remove('hidden');
    });

    btnCloseAdmin.addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });

    // Filtro Dropdown Multiplo
    const multiSelectModels = document.getElementById('multiSelectModels');
    const dropdownHeader = document.getElementById('dropdownHeader');
    const dropdownListContainer = document.getElementById('dropdownListContainer');
    const btnSelectAllModels = document.getElementById('btnSelectAllModels');
    const btnClearAllModels = document.getElementById('btnClearAllModels');
    const filterModelsList = document.getElementById('filterModelsList');

    dropdownHeader.addEventListener('click', (e) => {
        dropdownListContainer.classList.toggle('hidden');
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
        if (multiSelectModels && !multiSelectModels.contains(e.target)) {
            dropdownListContainer.classList.add('hidden');
        }
    });

    btnSelectAllModels.addEventListener('click', () => {
        const checkboxes = filterModelsList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
        updateModelFilters();
    });

    btnClearAllModels.addEventListener('click', () => {
        const checkboxes = filterModelsList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        updateModelFilters();
    });

    function updateModelFilters() {
        // Obter apenas as marcadas
        const checkboxes = filterModelsList.querySelectorAll('input[type="checkbox"]:checked');
        currentFilters.models = Array.from(checkboxes).map(cb => cb.value);
        
        const totalModels = filterModelsList.querySelectorAll('input[type="checkbox"]').length;
        if(currentFilters.models.length === 0) {
            dropdownHeader.innerHTML = 'Nenhum Modelo <i class="fa-solid fa-chevron-down" style="float: right; margin-top: 4px;"></i>';
        } else if (currentFilters.models.length === totalModels) {
            dropdownHeader.innerHTML = 'Todos os Modelos <i class="fa-solid fa-chevron-down" style="float: right; margin-top: 4px;"></i>';
        } else {
            dropdownHeader.innerHTML = `${currentFilters.models.length} selecionados <i class="fa-solid fa-chevron-down" style="float: right; margin-top: 4px;"></i>`;
        }
        
        applyFilters();
    }

    // Inicialização da Autenticação
    checkAuth();

    filterWarranty.addEventListener('change', (e) => {
        currentFilters.warranty = e.target.value;
        applyFilters();
    });

    // Mapeamento de UF para Código IBGE
    const ibgeCodes = {
        'RO': 11, 'AC': 12, 'AM': 13, 'RR': 14, 'PA': 15, 'AP': 16, 'TO': 17,
        'MA': 21, 'PI': 22, 'CE': 23, 'RN': 24, 'PB': 25, 'PE': 26, 'AL': 27, 'SE': 28, 'BA': 29,
        'MG': 31, 'ES': 32, 'RJ': 33, 'SP': 35,
        'PR': 41, 'SC': 42, 'RS': 43,
        'MS': 50, 'MT': 51, 'GO': 52, 'DF': 53
    };

    // Normalizador de nomes de cidades (Remove acentos, uppercase)
    const normalizeString = (str) => {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    };

    // Função principal
    async function initApp() {
        try {
            // Carregar Dados e GeoJSON das variáveis globais carregadas no index.html
            rawData = localDados;
            const geojson = localBrazilGeoJSON;

            if (!rawData || !geojson) throw new Error('Falha ao carregar dados locais (arquivos JS não carregados).');

            // Extrair modelos únicos globais para montar o select nativo
            const allModels = new Set();
            rawData.forEach(cityData => {
                if(!cityData.equipamentos) return;
                cityData.equipamentos.forEach(eq => {
                    if (eq.modelo && eq.modelo !== 'N/A') allModels.add(eq.modelo);
                });
            });
            populateModelsDropdown(Array.from(allModels).sort());

            // Processar chaves de busca rápidas
            rawData.forEach(item => {
                item.cidadeNormalizada = normalizeString(item.cidade);
            });

            // Aplica os filtros (que preencherão StateTotals) e Inicializa Mapa Base
            stateLayer = L.geoJSON(geojson, {
                style: getFeatureStyle,
                onEachFeature: onEachFeature
            }).addTo(map);

            applyFilters(true); // O true indica primeira carga (já renderiza stateMarkers e ajusta bounds)

            // Remove o loader
            setTimeout(() => {
                const loader = document.getElementById('loader');
                loader.style.opacity = '0';
                setTimeout(() => loader.classList.add('hidden'), 500);
            }, 500);

        } catch (error) {
            console.error(error);
            document.getElementById('loader').innerHTML = `
                <div style="color: #ef4444; text-align: center;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 40px; margin-bottom: 16px;"></i>
                    <p>Erro ao carregar dados: ${error.message}</p>
                    <pre style="font-size: 11px; text-align: left; max-width: 80%; margin: 10px auto; color: #fca5a5; overflow-x: auto;">${error.stack}</pre>
                </div>
            `;
        }
    }

    /* ----------------------------------------------------
       Motor de Filtros e UI
    ---------------------------------------------------- */
    function populateModelsDropdown(models) {
        filterModelsList.innerHTML = '';
        currentFilters.models = [...models];

        models.forEach(mod => {
            const label = document.createElement('label');
            label.className = 'dropdown-item';
            label.innerHTML = `
                <input type="checkbox" value="${mod}" checked>
                <span>${mod}</span>
            `;
            
            label.querySelector('input').addEventListener('change', updateModelFilters);
            filterModelsList.appendChild(label);
        });
        
        // As models count determines filter logic, currentFilters.models is pre-filled above
        // but we DO NOT call updateModelFilters() here anymore to prevent triggering
        // applyFilters() before stateLayer is created in initApp().
        
        const totalModels = models.length;
        dropdownHeader.innerHTML = 'Todos os Modelos <i class="fa-solid fa-chevron-down" style="float: right; margin-top: 4px;"></i>';
    }

    // Helper: Validar Garantia
    function isWarrantyValid(dateStr) {
        if (!dateStr || dateStr === 'N/A' || dateStr === '-') return false;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return false;
        
        const garantiaData = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return garantiaData >= new Date();
    }

    // O Motor Principal de Filtros
    function applyFilters(isFirstLoad = false) {
        stateTotals = {};
        let totalMaquinas = 0;
        let locaisValidos = new Set();

        const wFilter = currentFilters.warranty;
        const selectedModels = currentFilters.models;

        rawData.forEach(city => {
            if (!city.equipamentos) return;
            
            // FASE 1: Filtrar os equipamentos puros dessa cidade
            const filteredEqs = city.equipamentos.filter(eq => {
                // Filtro Modelo
                if (selectedModels.length === 0) return false;
                if (!selectedModels.includes(eq.modelo)) return false;

                // Filtro Garantia
                if (wFilter === 'active') {
                    if (!isWarrantyValid(eq.termino_garantia)) return false;
                } else if (wFilter === 'expired') {
                    if (isWarrantyValid(eq.termino_garantia)) return false;
                }

                return true;
            });

            // Re-hidratar a cidade contendo apenas o que sobrou
            city.filteredEquipamentos = filteredEqs;

            // Se sobrou algo na cidade, somamos ao estado
            if (filteredEqs.length > 0) {
                totalMaquinas += filteredEqs.length;
                filteredEqs.forEach(eq => locaisValidos.add(eq.local));

                const uf = city.uf;
                if (!stateTotals[uf]) stateTotals[uf] = 0;
                stateTotals[uf] += filteredEqs.length;
            }
        });

        // FASE 2: UI Updates Header
        document.getElementById('locaisCount').textContent = locaisValidos.size;
        document.getElementById('maquinasCount').textContent = totalMaquinas;

        // FASE 3: Mapa Updates
        renderStateMarkers();

        // Se estiver dentro de um estado lendo as cidades, force redraw imediato!
        if (currentActiveState) {
            renderCityGeoJSON(currentActiveState.feature.properties.sigla);
            // E o painel deve ser escondido se os dados dele puderem ter sumido
            infoPanel.classList.add('hidden');
        }

        if (isFirstLoad) {
            map.fitBounds(stateLayer.getBounds(), { padding: [10, 10] });
        }
    }

    // getFeatureStyle: Como fica o estado normal
    function getFeatureStyle(feature) {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            fillColor: isLight ? '#3b82f6' : '#161b22', // Azul claro com opacidade
            weight: 1.5,
            opacity: 1,
            color: isLight ? '#60a5fa' : '#30363d', // Borda
            fillOpacity: isLight ? 0.35 : 1
        };
    }

    // getHighlightStyle: Como fica no Hover
    function getHighlightStyle() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            fillColor: isLight ? '#93c5fd' : '#1f2937', // Hover azul intermediário no tema claro
            weight: 2,
            color: isLight ? '#2563eb' : '#3b82f6', 
            fillOpacity: isLight ? 0.5 : 1
        };
    }

    function getActiveStyle() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            fillColor: isLight ? '#f8fafc' : '#0f172a', // Fundo claro no estado ativo par destacar as cidades azuis
            weight: 3,
            color: isLight ? '#3b82f6' : '#0ea5e9',
            fillOpacity: 1
        };
    }

    /* ----------------------------------------------------
       Eventos dos Estados (Drill-down)
    ---------------------------------------------------- */
    function onEachFeature(feature, layer) {
        layer.on({
            mouseover: highlightFeature,
            mouseout: resetHighlight,
            click: clickFeature
        });
    }

    function highlightFeature(e) {
        const layer = e.target;
        if (currentActiveState !== layer) {
            layer.setStyle(getHighlightStyle());
            layer.bringToFront();
        }
    }

    function resetHighlight(e) {
        const layer = e.target;
        if (currentActiveState !== layer) {
            stateLayer.resetStyle(layer);
        }
    }

    async function clickFeature(e) {
        const layer = e.target;
        const sigla = layer.feature.properties.sigla;

        if (currentActiveState === layer) return;

        if (currentActiveState) {
            stateLayer.resetStyle(currentActiveState);
        }

        currentActiveState = layer;
        layer.setStyle(getActiveStyle());
        layer.bringToFront();

        // Limpar visão nacional
        map.removeLayer(stateMarkers);

        // Zoom para o Estado
        map.flyToBounds(layer.getBounds(), { padding: [20, 20], duration: 1.5 });

        // Mostrar Botão Voltar
        btnBackBrasil.classList.remove('hidden');

        // Carregar a malha e os dados das cidades desse Estado
        await renderCityGeoJSON(sigla);
    }

    /* ----------------------------------------------------
       Nível Nacional: Marcadores de Totais nos Estados
    ---------------------------------------------------- */
    function renderStateMarkers() {
        stateMarkers.clearLayers();

        stateLayer.eachLayer(function (layer) {
            const sigla = layer.feature.properties.sigla;
            const total = stateTotals[sigla];

            if (total > 0) {
                const center = layer.getBounds().getCenter();
                const icon = L.divIcon({
                    html: `
                        <div class="state-total-marker" title="Clique no Estado para ver as cidades">
                            <span class="state-sigla">${sigla}</span>
                            <span class="state-count">${total}</span>
                        </div>
                    `,
                    className: 'dummy-class-for-state',
                    iconSize: [50, 50],
                    iconAnchor: [25, 25]
                });
                const marker = L.marker(center, { icon, interactive: false });
                stateMarkers.addLayer(marker);
            }
        });
    }

    /* ----------------------------------------------------
       Módulo Nível Cidade: Polígonos das Cidades (Nativo)
    ---------------------------------------------------- */
    async function renderCityGeoJSON(sigla) {
        // Mostrar um leve loading indicando que está buscando a malha
        document.body.style.cursor = 'wait';

        // Remover malha antiga se existir
        if (cityGeoLayer) {
            map.removeLayer(cityGeoLayer);
            cityGeoLayer = null;
        }

        const codigoIbge = ibgeCodes[sigla];
        if (!codigoIbge) {
            console.error("Código IBGE não encontrado para a sigla", sigla);
            document.body.style.cursor = 'default';
            return;
        }

        // Buscar dados apenas dessa UF e Cidades que tenham sobrado na filtragem atual
        const estadoDados = rawData.filter(d => d.uf === sigla && d.filteredEquipamentos && d.filteredEquipamentos.length > 0);
        const mapDadosCidade = {}; // { 'SAO PAULO': item, 'CAMPINAS': item }
        estadoDados.forEach(item => {
            mapDadosCidade[item.cidadeNormalizada] = item;
        });

        try {
            const res = await fetch(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${codigoIbge}-mun.json`);
            if (!res.ok) throw new Error('Falha no GeoJSON de Município');
            const cityData = await res.json();
            cityGeoLayer = L.geoJSON(cityData, {
                style: function (feature) {
                    const cityName = normalizeString(feature.properties.name);
                    const matchingData = mapDadosCidade[cityName];
                    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

                    // Se essa cidade tiver equipamentos no nosso JSON, destaca o fundo!
                    if (matchingData) {
                        return {
                            fillColor: '#3b82f6', // Glow primary blue
                            fillOpacity: 0.35,     // Destacado mas translúcido para ver as malhas
                            color: isLight ? '#1d4ed8' : '#93c5fd', // Borda mais clara (#93c5fd) no escuro para saltar aos olhos
                            weight: isLight ? 2.5 : 2.0, // Aumentando espessura no modo escuro pra destacar bem
                            opacity: 1
                        };
                    } else {
                        // Cidades vazias daquele estado
                        return {
                            fillColor: 'transparent',
                            color: isLight ? '#94a3b8' : '#334155', // Deixando as linhas do escuro mais claras (#334155 ao invés de #1e293b)
                            weight: isLight ? 1.2 : 1.0, // Grade vazia levemente mais grossa no modo escuro também
                            opacity: isLight ? 0.7 : 0.6
                        };
                    }
                },
                onEachFeature: function (feature, layer) {
                    const cityName = normalizeString(feature.properties.name);
                    const matchingData = mapDadosCidade[cityName];

                    if (matchingData) {
                        // Construir o HTML consolidado da cidade a partir dos dados brutod filtrados
                        const popupContentHTML = generateCityPopupHTML(matchingData);

                        // Amarrar o clique/toque do Polígono para abrir o Painel Lateral
                        layer.on('click touchend', (e) => {
                            L.DomEvent.preventDefault(e); // Previne ghost clicks em mobile
                            openCityPanel(popupContentHTML);
                        });

                        // Extrais o centro do polígono para desenhar o marcador de quantidade lá dentro
                        const total_maquinas_filtradas = matchingData.filteredEquipamentos.length;
                        const layerCenter = layer.getBounds().getCenter();
                        const cityIcon = L.divIcon({
                            html: `
                                <div class="city-total-marker" title="Máquinas instaladas em ${matchingData.cidade}">
                                    <span class="city-count">${total_maquinas_filtradas}</span>
                                </div>
                            `,
                            className: 'dummy-class-for-city',
                            iconSize: [30, 30],
                            iconAnchor: [15, 15]
                        });
                        
                        const cityMarker = L.marker(layerCenter, { icon: cityIcon }).addTo(cityMarkersLayer);
                        
                        // Amarrar o clique/toque do Número para abrir o Painel Lateral
                        cityMarker.on('click touchend', (e) => {
                            L.DomEvent.preventDefault(e);
                            openCityPanel(popupContentHTML);
                        });

                        // Efeito de hover orgânico e bonito mas só nas cidades com coisas
                        layer.on({
                            mouseover: function (e) {
                                const target = e.target;
                                target.setStyle({
                                    fillOpacity: 0.6,
                                    weight: 2
                                });
                                target.bringToFront();
                            },
                            mouseout: function (e) {
                                cityGeoLayer.resetStyle(e.target);
                            }
                        });
                    }
                }
            }).addTo(map);

        } catch (error) {
            console.error('Erro carregando contornos de cidade:', error);
        } finally {
            document.body.style.cursor = 'default';
        }
    }

    // Função para abrir o painel lateral com o HTML injetado
    function openCityPanel(htmlContent) {
        infoPanelContent.innerHTML = htmlContent;
        infoPanel.classList.remove('hidden');
    }

    // Geração de HTML Consolidado do Popup de Cidade Calculado Pela UI
    function generateCityPopupHTML(item) {
        
        // Agregar dinamicamente a partir dos equipamentos filtrados
        const modelsMap = {};
        const localSet = new Set();
        const contractSet = new Set();
        const warrantySet = new Set();

        item.filteredEquipamentos.forEach(eq => {
            localSet.add(eq.local);
            if(eq.contrato && eq.contrato !== 'N/A') contractSet.add(eq.contrato);
            if(eq.termino_garantia && eq.termino_garantia !== 'N/A') warrantySet.add(eq.termino_garantia);
            
            if(!modelsMap[eq.modelo]) modelsMap[eq.modelo] = 0;
            modelsMap[eq.modelo]++;
        });

        const arrayLocais = Array.from(localSet);
        const arrayContratos = Array.from(contractSet);
        const arrayWarranties = Array.from(warrantySet);
        const totalFiltered = item.filteredEquipamentos.length;

        const modelosHtml = Object.entries(modelsMap).map(([modelo, qtd]) => `
            <li>
                <span>${modelo}</span>
                <span class="model-count">${qtd} un</span>
            </li>
        `).join('');

        const contratosHtml = arrayContratos.map(c => `
            <span class="badge-item"><i class="fa-solid fa-file-signature"></i> ${c}</span>
        `).join('');

        const hojeObj = new Date();
        const garantiasHtml = arrayWarranties.map(g => {
            // Analisando a data (Assumindo formato YYYY-MM-DD exibido)
            let isExpired = false;
            if (g && g !== 'N/A' && g !== '-') {
                const parts = g.split('-');
                if (parts.length === 3) {
                    const ano = parseInt(parts[0], 10);
                    const mes = parseInt(parts[1], 10) - 1; // Meses em JS começam em 0
                    const dia = parseInt(parts[2], 10);
                    const garantiaData = new Date(ano, mes, dia);
                    if (garantiaData < hojeObj) isExpired = true;
                }
            }

            const activeClass = isExpired ? 'expired' : '';
            const icon = isExpired ? 'fa-solid fa-calendar-xmark' : 'fa-solid fa-calendar-check';

            return `<span class="badge-item warranty-badge ${activeClass}"><i class="${icon}"></i> ${g}</span>`;
        }).join('');

        const locaisHtml = arrayLocais.map(l => `
            <li><i class="fa-solid fa-building" style="color:var(--text-muted); margin-right:4px;"></i> <span>${l}</span></li>
        `).join('');

        const popupContent = `
            <div class="custom-popup">
                <h3><i class="fa-solid fa-map-location-dot"></i> ${item.cidade} - ${item.uf}</h3>
                <p class="city-subtitle" style="font-size:0.8rem; margin-bottom:8px;">
                    Total de Máquinas Instaladas: <span style="font-weight:bold; color:var(--text-main);">${totalFiltered}</span>
                </p>
                
                <div class="popup-section">
                    <h4>Locais de Instalação (${arrayLocais.length})</h4>
                    <ul class="model-list" style="overflow-y: auto; padding-right: 4px;">
                        ${locaisHtml}
                    </ul>
                </div>

                <div class="popup-section">
                    <h4>Modelos Resumo</h4>
                    <ul class="model-list">
                        ${modelosHtml}
                    </ul>
                </div>

                ${garantiasHtml ? `
                <div class="popup-section">
                    <h4>Término de Garantia(s)</h4>
                    <div class="warranty-container" style="display:flex; flex-wrap:wrap;">
                        ${garantiasHtml}
                    </div>
                </div>` : ''}

                ${contratosHtml ? `
                <div class="popup-section">
                    <h4>Contratos Relacionados</h4>
                    <div class="contracts-container" style="display:flex; flex-wrap:wrap;">
                        ${contratosHtml}
                    </div>
                </div>` : ''}
            </div>
        `;

        return popupContent;
    }

    /* ----------------------------------------------------
       Voltando à Visão Nacional
    ---------------------------------------------------- */
    function resetToNationalView() {
        if (currentActiveState) {
            stateLayer.resetStyle(currentActiveState);
            currentActiveState = null;
        }

        // Esconder malha municipal
        if (cityGeoLayer) {
            map.removeLayer(cityGeoLayer);
            cityGeoLayer = null;
        }

        // Limpar marcadores numéricos flutuantes
        cityMarkersLayer.clearLayers();

        // Esconder o Painel Lateral
        infoPanel.classList.add('hidden');

        // Mostrar Botão Voltar: Esconde
        btnBackBrasil.classList.add('hidden');

        // Restaurar visão nacional (Totais)
        map.addLayer(stateMarkers);

        // Zoom pro Brasil (exatamente igual ao carregamento da página)
        map.flyTo([-14.235, -51.925], 5, { duration: 1.5 });
    }

    // Inicializar app
    initApp();
});
