// main.js - Gestione calendario ed eventi
document.addEventListener('DOMContentLoaded', async function() {
    // Configurazione globale
    const CONFIG = {
        currentDate: '2025-02-06 16:15:21',
        currentUser: 'Gaia-Cecchi',
        calendarColors: {
            background: '#033043',
            border: '#033043',
            text: '#FFFFFF'
        }
    };

    // Funzioni di gestione eventi
    async function loadEvents() {
        console.log('Iniziando il caricamento degli eventi...');
        try {
            const response = await fetch('./eventi_siena.json');
            if (!response.ok) {
                throw new Error('Errore nel caricamento degli eventi: ' + response.statusText);
            }
            const data = await response.json();
            console.log('Eventi caricati:', data);
            
            const calendarEvents = prepareEvents(data);
            console.log('Eventi preparati per il calendario:', calendarEvents);
            
            return calendarEvents;
        } catch (error) {
            console.error('Errore durante il caricamento degli eventi:', error);
            throw error;
        }
    }

    function prepareEvents(data) {
        if (!Array.isArray(data)) {
            console.error('Errore: data non è un array:', data);
            return [];
        }

        return data.map(event => {
            const dateStr = event['Data'];
            let start;

            if (dateStr.includes('Dal')) {
                const dates = parseDateRange(dateStr);
                if (dates.length > 0) {
                    start = dates[0];
                }
            } else {
                start = formatDateToISO(dateStr);
            }

            if (!start) {
                console.error('Data non valida per evento:', event);
                return null;
            }

            return {
                title: event['Titolo evento'],
                start: start,
                allDay: true,
                backgroundColor: CONFIG.calendarColors.background,
                borderColor: CONFIG.calendarColors.border,
                textColor: CONFIG.calendarColors.text,
                extendedProps: {
                    description: event['Descrizione Groq'] || event['Descrizione di Virgilio.it'],
                    location: event['Luogo'],
                    time: event['Orario'],
                    price: event['Prezzo']
                }
            };
        }).filter(event => event !== null);
    }

    function formatDateToISO(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length !== 2) return null;
        
        // Crea la data alle 00:00 del giorno specificato nel fuso orario locale
        const date = new Date(2025, parseInt(parts[1]) - 1, parseInt(parts[0]));
        date.setHours(0, 0, 0, 0);
        
        return date.toISOString().split('T')[0];
    }

    function parseDateRange(dateRange) {
        if (!dateRange) return [];
        
        const regex = /Dal (\d{1,2})\/(\d{1,2}) al (\d{1,2})\/(\d{1,2})/;
        const match = dateRange.match(regex);
        if (!match) return [];

        const startDay = parseInt(match[1]);
        const startMonth = parseInt(match[2]);
        const endDay = parseInt(match[3]);
        const endMonth = parseInt(match[4]);

        const startDate = new Date(2025, startMonth - 1, startDay);
        const endDate = new Date(2025, endMonth - 1, endDay);
        
        const dates = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            dates.push(formatDateToISO(
                `${currentDate.getDate()}/${currentDate.getMonth() + 1}`
            ));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
    }

    function createEventPopup() {
        const popup = document.createElement('div');
        popup.className = 'event-popup';
        popup.innerHTML = `
            <div class="event-popup-header">
                <div class="event-popup-date"></div>
                <button class="event-popup-close">&times;</button>
            </div>
            <div class="event-popup-list"></div>
        `;

        const overlay = document.createElement('div');
        overlay.className = 'event-popup-overlay';

        document.body.appendChild(overlay);
        document.body.appendChild(popup);

        return { popup, overlay };
    }

    function showEventPopup(date, events) {
        const { popup, overlay } = createEventPopup();
        
        // Formatta la data
        const dateStr = date.toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        popup.querySelector('.event-popup-date').textContent = dateStr;
        
        const list = popup.querySelector('.event-popup-list');
        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'event-popup-item';
            item.innerHTML = `
                <h3>${event.title}</h3>
                <div class="event-popup-details">
                    ${event.extendedProps.time ? `<p>🕒 ${event.extendedProps.time}</p>` : ''}
                    ${event.extendedProps.location ? `<p>📍 ${event.extendedProps.location}</p>` : ''}
                    ${event.extendedProps.price ? `<p>💰 ${event.extendedProps.price}</p>` : ''}
                </div>
                <div class="event-popup-description">
                    ${event.extendedProps.description || 'Nessuna descrizione disponibile'}
                </div>
            `;
            
            item.addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
            
            list.appendChild(item);
        });

        // Gestisci la chiusura
        const closePopup = () => {
            popup.classList.remove('active');
            overlay.classList.remove('active');
            setTimeout(() => {
                popup.remove();
                overlay.remove();
            }, 300);
        };

        popup.querySelector('.event-popup-close').addEventListener('click', closePopup);
        overlay.addEventListener('click', closePopup);

        // Mostra il popup
        requestAnimationFrame(() => {
            popup.classList.add('active');
            overlay.classList.add('active');
        });
    }

    function initializeCalendar(events) {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl || !Array.isArray(events)) return null;

        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            initialDate: CONFIG.currentDate.split(' ')[0],
            locale: 'it',
            buttonText: {
                today: 'Oggi',
                month: 'Mese',
                week: 'Settimana',
                day: 'Giorno'
            },
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth'
            },
            height: 'auto',
            contentHeight: 800,
            displayEventTime: false,
            dayMaxEvents: true,
            events: events,
            eventBackgroundColor: CONFIG.calendarColors.background,
            eventBorderColor: CONFIG.calendarColors.border,
            eventTextColor: CONFIG.calendarColors.text,
            eventClassNames: 'calendar-event',
            dateClick: function(info) {
                const dayEvents = events.filter(event => {
                    const eventDate = new Date(event.start);
                    // Usiamo lo stesso formato ISO per il confronto
                    return eventDate.toISOString().split('T')[0] === info.date.toISOString().split('T')[0];
                });
                
                if (dayEvents.length > 0) {
                    showEventPopup(info.date, dayEvents);
                }
            },
            dayCellDidMount: function(info) {
                const dayEvents = events.filter(event => {
                    const eventDate = new Date(event.start);
                    return eventDate.toISOString().split('T')[0] === info.date.toISOString().split('T')[0];
                });
                
                if (dayEvents.length > 0) {
                    const eventCount = dayEvents.length;
                    info.el.setAttribute('data-event-count', eventCount);
                    info.el.classList.add('has-events');

                    // Forza il ridisegno dello stile
                    info.el.style.opacity = '0.99';
                    requestAnimationFrame(() => {
                        info.el.style.opacity = '1';
                    });
                }
            }
        });

        // Funzione per aggiornare i pallini dopo il filtraggio
        calendar.updateDots = function(filteredEvents) {
            // Rimuovi tutti i pallini esistenti
            document.querySelectorAll('.fc-daygrid-day').forEach(cell => {
                cell.classList.remove('has-events');
                cell.removeAttribute('data-event-count');
            });

            // Aggiungi i pallini solo per gli eventi filtrati
            const eventsByDate = new Map();
            
            filteredEvents.forEach(event => {
                const dateStr = new Date(event.start).toISOString().split('T')[0];
                const count = eventsByDate.get(dateStr) || 0;
                eventsByDate.set(dateStr, count + 1);
            });

            eventsByDate.forEach((count, dateStr) => {
                const cell = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
                if (cell) {
                    cell.classList.add('has-events');
                    cell.setAttribute('data-event-count', count);
                }
            });
        };

        calendar.render();
        return calendar;
    }

    function initializeFilters(calendar, events) {
        const filterDropdowns = document.querySelectorAll('.filter-dropdown');
        
        // Gestione dropdown
        filterDropdowns.forEach(dropdown => {
            const header = dropdown.querySelector('.filter-header');
            
            header.addEventListener('click', () => {
                filterDropdowns.forEach(other => {
                    if (other !== dropdown) other.classList.remove('active');
                });
                dropdown.classList.toggle('active');
            });

            const options = dropdown.querySelectorAll('.filter-option');
            options.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation(); // Previene la chiusura del dropdown
                    option.classList.toggle('selected');
                    applyFilters(calendar, events); // Applica i filtri immediatamente
                });
            });
        });

        // Click fuori dai dropdown per chiuderli
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-dropdown')) {
                filterDropdowns.forEach(dropdown => dropdown.classList.remove('active'));
            }
        });

        // Filtro per nome
        const nameFilter = document.getElementById('nameFilter');
        if (nameFilter) {
            nameFilter.addEventListener('input', () => applyFilters(calendar, events));
        }

        // Pulsante di aggiornamento
        const updateButton = document.getElementById('updateEvents');
        if (updateButton) {
            updateButton.addEventListener('click', () => applyFilters(calendar, events));
        }

        // Pulsante reset
        const resetButton = document.getElementById('resetFilters');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                // Reset filtro nome
                if (nameFilter) {
                    nameFilter.value = '';
                }

                // Reset filtri dropdown
                document.querySelectorAll('.filter-option.selected').forEach(option => {
                    option.classList.remove('selected');
                });

                // Reset calendario e pallini
                calendar.removeAllEvents();
                calendar.addEventSource(events);
                calendar.updateDots(events); // Aggiorna i pallini con tutti gli eventi
            });
        }
    }

    function applyFilters(calendar, events) {
        console.log('Applying filters...'); // Debug

        // Ottieni i valori dei filtri
        const nameFilter = document.getElementById('nameFilter')?.value.toLowerCase() || '';
        const selectedCategories = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(1) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());
        const selectedGenres = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(2) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());
        const selectedLocations = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(3) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());
        const selectedDistances = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(4) .filter-option.selected'))
            .map(opt => parseInt(opt.textContent.match(/\d+/)[0]));
        const selectedTimes = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(5) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());

        console.log('Selected filters:', { // Debug
            nameFilter,
            selectedCategories,
            selectedGenres,
            selectedLocations,
            selectedDistances,
            selectedTimes
        });

        const filteredEvents = events.filter(event => {
            // Filtro per nome
            if (nameFilter && !event.title.toLowerCase().includes(nameFilter)) {
                return false;
            }

            // Filtro per categoria
            if (selectedCategories.length > 0 && !selectedCategories.some(cat => 
                event.title.toLowerCase().includes(cat) || 
                event.extendedProps.description?.toLowerCase().includes(cat))) {
                return false;
            }

            // Filtro per genere
            if (selectedGenres.length > 0 && !selectedGenres.some(genre => 
                event.extendedProps.description?.toLowerCase().includes(genre))) {
                return false;
            }

            // Filtro per luogo
            if (selectedLocations.length > 0 && !selectedLocations.some(location => 
                event.extendedProps.location?.toLowerCase().includes(location))) {
                return false;
            }

            // Filtro per ora
            if (selectedTimes.length > 0) {
                const eventTime = event.extendedProps.time?.toLowerCase() || '';
                const timeMatch = selectedTimes.some(timeSlot => {
                    switch(timeSlot) {
                        case 'mattina': 
                            return /^(0[9]|1[0-2]):/i.test(eventTime);
                        case 'pomeriggio': 
                            return /^(1[4-8]):/i.test(eventTime);
                        case 'sera': 
                            return /^(19|2[0-3]):/i.test(eventTime);
                        case 'tutto il giorno': 
                            return true;
                        default: 
                            return false;
                    }
                });
                if (!timeMatch) return false;
            }

            return true;
        });

        console.log('Filtered events:', filteredEvents); // Debug

        // Aggiorna il calendario e i pallini
        calendar.removeAllEvents();
        calendar.addEventSource(filteredEvents);
        calendar.updateDots(filteredEvents); // Aggiorna i pallini con gli eventi filtrati
    }

    // Funzione per calcolare la distanza in km tra due punti usando la formula di Haversine
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raggio della Terra in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distanza in km
    }

    // Funzione per ottenere le coordinate di un luogo (da implementare con un servizio di geocoding)
    function getEventLocation(locationName) {
        // Coordinate del centro di Siena (Piazza del Campo) come default
        const SIENA_CENTER = { lat: 43.3177, lng: 11.3255 };
        
        // Mappa delle location con coordinate approssimate rispetto a Piazza del Campo
        const locations = {
            'teatro dei rozzi': { lat: 43.318509, lng: 11.331550 },
            'nelson mandela forum': { lat: 43.780087, lng: 11.234897 },
            'teatro verdi': { lat: 43.318800, lng: 11.330900 },
            'museo del tessuto': { lat: 43.319100, lng: 11.329800 }
        };

        return locations[locationName.toLowerCase()] || SIENA_CENTER;
    }

    // Inizializzazione dell'applicazione
    async function init() {
        try {
            const events = await loadEvents();
            if (events) {
                const calendar = initializeCalendar(events);
                if (calendar) {
                    initializeFilters(calendar, events);
                    // Esporta gli eventi per il chatbot
                    window.calendarEvents = events;
                    // Inizializza il chatbot (verrà gestito da chatbot.js)
                    if (typeof initChatbot === 'function') {
                        initChatbot(events);
                    }
                }
            }
        } catch (error) {
            console.error('Errore di inizializzazione:', error);
            alert('Si è verificato un errore durante l\'inizializzazione dell\'applicazione.');
        }
    }

    // Esporta funzioni per uso esterno
    window.calendarUtils = {
        CONFIG,
        loadEvents,
        initializeCalendar,
        initializeFilters
    };

    // Avvia l'applicazione
    init();
});

// Aggiungi questo JavaScript per gestire il toggle del menu
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.hamburger-menu');
    const navLinks = document.querySelector('.nav-links');
    
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Chiudi il menu quando si clicca su un link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });
});