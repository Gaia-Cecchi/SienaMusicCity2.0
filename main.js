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
        return `2025-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
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
            eventContent: function(info) {
                return {
                    html: `
                        <div class="fc-content">
                            <div class="event-title">${info.event.title}</div>
                            <div class="event-details">
                                ${info.event.extendedProps.time ? 
                                    `<span class="event-time">${info.event.extendedProps.time}</span>` : ''}
                                ${info.event.extendedProps.location ? 
                                    `<span class="event-location">${info.event.extendedProps.location}</span>` : ''}
                            </div>
                        </div>
                    `
                };
            },
            eventClick: function(info) {
                const prices = Array.isArray(info.event.extendedProps.price) 
                    ? info.event.extendedProps.price.join('\n') 
                    : info.event.extendedProps.price || 'Prezzo non specificato';

                alert(
                    `Evento: ${info.event.title}\n\n` +
                    `Luogo: ${info.event.extendedProps.location || 'Luogo non specificato'}\n` +
                    `Data: ${info.event.start.toLocaleDateString('it-IT')}\n` +
                    `Orario: ${info.event.extendedProps.time || 'Orario non specificato'}\n\n` +
                    `Prezzi:\n${prices}\n\n` +
                    `Descrizione:\n${info.event.extendedProps.description || 'Nessuna descrizione disponibile'}`
                );
            }
        });

        calendar.render();
        return calendar;
    }

    function initializeFilters(calendar, events) {
        const filterDropdowns = document.querySelectorAll('.filter-dropdown');
        
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
                option.addEventListener('click', () => {
                    option.classList.toggle('selected');
                    applyFilters(calendar, events);
                });
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-dropdown')) {
                filterDropdowns.forEach(dropdown => dropdown.classList.remove('active'));
            }
        });

        const nameFilter = document.getElementById('nameFilter');
        if (nameFilter) {
            nameFilter.addEventListener('input', () => applyFilters(calendar, events));
        }
    }

    function applyFilters(calendar, events) {
        const nameFilter = document.getElementById('nameFilter')?.value.toLowerCase() || '';
        const selectedCategories = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(1) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());
        const selectedGenres = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(2) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());
        const selectedTimes = Array.from(document.querySelectorAll('.filter-dropdown:nth-child(3) .filter-option.selected'))
            .map(opt => opt.textContent.toLowerCase());

        const filteredEvents = events.filter(event => {
            if (nameFilter && !event.title.toLowerCase().includes(nameFilter)) return false;
            if (selectedCategories.length > 0 && !selectedCategories.some(cat => 
                event.title.toLowerCase().includes(cat))) return false;
            if (selectedGenres.length > 0 && !selectedGenres.some(genre => 
                event.extendedProps.description?.toLowerCase().includes(genre))) return false;
            if (selectedTimes.length > 0 && !selectedTimes.some(time => 
                event.extendedProps.time?.toLowerCase().includes(time))) return false;
            return true;
        });

        calendar.removeAllEvents();
        calendar.addEventSource(filteredEvents);
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