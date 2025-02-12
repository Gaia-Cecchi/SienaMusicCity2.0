class EventiChatbot {
    static MODEL = "llama-3.3-70b-versatile";
    static MAX_HISTORY = 6;
    static MIN_SEARCH_TERM_LENGTH = 3;

    constructor(events) {
        this.events = this.preprocessEvents(events);
        this.conversationHistory = [];
        
        const now = new Date();
        this.currentDate = new Date(2025, now.getMonth(), now.getDate(), 
            now.getHours(), now.getMinutes(), now.getSeconds());
        
        this.currentUser = 'Anonymous';
        this.apiKey = null;
        this.initialized = false;

        this.elements = this.cacheDOMElements();
        
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = '';
        }

        this.setupEventListeners();
        this.showApiKeyModal();
        this.addWelcomeMessage();

        this.eventIndex = this.createEventIndex(events);
    }

    showApiKeyModal() {
        const modal = document.createElement('div');
        modal.className = 'api-key-modal';
        modal.innerHTML = `
            <div class="api-key-content">
                <h2>👋 Benvenuto nel Prototipo del Chatbot!</h2>
                <p>Per utilizzare il chatbot, è necessaria una chiave API personale di Groq.</p>
                
                <div class="api-instructions">
                    <h3>Come ottenere la tua chiave API:</h3>
                    <ol>
                        <li>Visita <a href="https://console.groq.com/sign-up" target="_blank">Groq Console</a></li>
                        <li>Crea un account gratuito</li>
                        <li>Vai alla sezione "API Keys"</li>
                        <li>Genera una nuova chiave API</li>
                    </ol>
                    
                    <div class="api-warning">
                        ⚠️ <strong>Importante:</strong> Non condividere mai la tua chiave API. 
                        Questa richiesta è necessaria solo per il prototipo.
                    </div>

                    <p class="readme-link">
                        📚 <a href="https://github.com/Gaia-Cecchi/Siena-Music-City-v2.0/tree/main#readme" 
                           target="_blank">Consulta la guida completa</a>
                        per conoscere tutte le funzionalità del progetto e come utilizzarle.
                    </p>
                </div>
                
                <div class="api-input-container">
                    <input type="password" id="api-key-input" 
                        placeholder="Inserisci la tua chiave API Groq" />
                    <button id="submit-api-key">Inizia a chattare</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const submitButton = modal.querySelector('#submit-api-key');
        const input = modal.querySelector('#api-key-input');

        submitButton.addEventListener('click', () => {
            const key = input.value.trim();
            if (this.validateApiKey(key)) {
                this.apiKey = key;
                modal.remove();
                this.addWelcomeMessage();
            } else {
                alert('Per favore inserisci una chiave API Groq valida');
            }
        });
    }

    validateApiKey(key) {
        return key && key.startsWith('gsk_') && key.length > 20;
    }

    preprocessEvents(events) {
        return events.map(event => {
            const dateParts = event.start.split('T')[0].split('-');
            const localDate = new Date(
                parseInt(dateParts[0]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[2]),
                1, 0, 0
            );
            
            localDate.setDate(localDate.getDate() + 1);
            
            return {
                ...event,
                searchText: `${event.title} ${event.extendedProps.location} ${event.extendedProps.description}`.toLowerCase(),
                date: localDate
            };
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    cacheDOMElements() {
        return {
            chatMessages: document.getElementById('chat-messages'),
            chatInput: document.getElementById('chat-input'),
            sendButton: document.getElementById('send-message'),
            toggleButton: document.getElementById('toggle-chat'),
            chatWidget: document.getElementById('chat-widget')
        };
    }

    setupEventListeners() {
        const { chatInput, sendButton, chatWidget } = this.elements;

        const chatHeader = document.querySelector('.chat-header');
        const toggleButton = document.getElementById('toggle-chat');
        
        const toggleChat = () => chatWidget.classList.toggle('minimized');
        
        if (chatHeader) chatHeader.addEventListener('click', toggleChat);
        if (toggleButton) toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChat();
        });

        if (sendButton) {
            sendButton.addEventListener('click', () => this.handleUserMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleUserMessage();
                }
            });
        }
    }

    addWelcomeMessage() {
        if (!this.initialized) {
            this.addMessage('Ciao! Sono Alice, la tua guida agli eventi di Siena! 🎭 Come posso aiutarti?', 'bot');
            this.initialized = true;
        }
    }

    async handleUserMessage() {
        if (!this.apiKey) {
            this.showApiKeyModal();
            return;
        }

        const { chatInput } = this.elements;
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        this.addMessage(message, 'user');
        chatInput.value = '';

        const typingIndicator = this.addTypingIndicator();

        try {
            const response = await this.generateResponse(message);
            this.addMessage(response, 'bot');
        } catch (error) {
            console.error('Error:', error);
            this.addMessage("Mi dispiace, puoi ripetere in altro modo?", 'bot');
        } finally {
            typingIndicator.remove();
        }
    }

    createEventIndex(events) {
        return events.map(event => {
            const dateParts = event.start.split('T')[0].split('-');
            const localDate = new Date(
                parseInt(dateParts[0]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[2]),
                1, 0, 0
            );

            localDate.setDate(localDate.getDate() + 1);

            return {
                title: event.title || '',
                description: event.extendedProps?.description || '',
                location: event.extendedProps?.location || '',
                date: localDate,
                time: event.extendedProps?.time || '',
                price: event.extendedProps?.price || '',
                searchText: `${event.title} ${event.extendedProps?.description} ${event.extendedProps?.location}`.toLowerCase()
            };
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    searchEvents(query, maxResults = 3) {
        // Verifica se è una richiesta per il weekend
        if (this.isWeekendQuery(query)) {
            return this.getWeekendEvents();
        }

        const keywords = query.toLowerCase().split(' ');
        const results = this.eventIndex
            .map(event => {
                const score = keywords.reduce((acc, keyword) => {
                    if (event.searchText.includes(keyword)) {
                        acc += 1;
                    }
                    return acc;
                }, 0);
                return { event, score };
            })
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);

        return results.map(r => r.event);
    }

    isWeekendQuery(query) {
        const weekendKeywords = ['weekend', 'fine settimana', 'sabato', 'domenica'];
        return weekendKeywords.some(keyword => query.toLowerCase().includes(keyword));
    }

    getWeekendEvents() {
        const today = new Date(this.currentDate);
        const friday = new Date(today);
        friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7));
        
        const sunday = new Date(friday);
        sunday.setDate(friday.getDate() + 2);

        return this.eventIndex.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= friday && eventDate <= sunday;
        });
    }

    async generateResponse(message) {
        const relevantEvents = this.searchEvents(message);
        
        const eventsContext = relevantEvents.length > 0 ? 
            `Ho trovato questi eventi che potrebbero interessarti:\n${
                relevantEvents.map(event => 
                    `- ${event.title} (${event.date.toLocaleDateString('it-IT')})
                     📍 ${event.location}
                     ⏰ ${event.time}
                     ${event.price ? `💰 ${event.price}` : ''}`
                ).join('\n')
            }` : 
            'Non ho trovato eventi specifici per questa richiesta.';

        if (this.isBasicGreeting(message) && this.conversationHistory.length === 0) {
            return "Come posso aiutarti a trovare eventi interessanti?";
        }

        if (this.isEventRelatedQuery(message)) {
            return this.formatEventResponse(relevantEvents, message);
        }

        try {
            const response = await this.getGroqResponse(message, eventsContext);
            if (this.isValidResponse(response)) {
                return response;
            }
        } catch (error) {
            console.error('API Error:', error);
        }

        return this.getGenericResponse();
    }

    formatEventResponse(events, query) {
        if (events.length === 0) {
            if (this.isWeekendQuery(query)) {
                return "Mi dispiace, non ho trovato eventi per questo weekend. Vuoi che ti mostri altri eventi in programma?";
            }
            return "Mi dispiace, non ho trovato eventi che corrispondono alla tua ricerca. Vuoi provare a cercare in un altro modo?";
        }

        if (this.isWeekendQuery(query)) {
            return `Ecco gli eventi in programma per il weekend:\n${this.formatEventsList(events)}`;
        }

        const today = new Date();
        const isDateQuery = query.toLowerCase().includes('oggi') || query.toLowerCase().includes('domani');

        if (isDateQuery) {
            const todayEvents = events.filter(e => 
                e.date.toDateString() === today.toDateString()
            );

            if (query.toLowerCase().includes('oggi')) {
                return todayEvents.length > 0 ? 
                    `Ecco gli eventi di oggi:\n${this.formatEventsList(todayEvents)}` :
                    "Oggi non ci sono eventi programmati. Vuoi vedere i prossimi eventi?";
            }
        }

        return `Ho trovato questi eventi che potrebbero interessarti:\n${this.formatEventsList(events)}`;
    }

    formatEventsList(events) {
        return events.map(event => 
            `🎭 ${event.title}\n` +
            `📅 ${event.date.toLocaleDateString('it-IT')}\n` +
            `📍 ${event.location}\n` +
            `⏰ ${event.time}\n` +
            (event.price ? `💰 ${event.price}\n` : '')
        ).join('\n');
    }

    async getGroqResponse(userMessage, eventsContext) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: EventiChatbot.MODEL,
                messages: [
                    {
                        role: "system",
                        content: this.getSystemPrompt()
                    },
                    ...this.conversationHistory,
                    {
                        role: "user",
                        content: userMessage
                    },
                    {
                        role: "system",
                        content: eventsContext
                    }
                ],
                temperature: 0.6,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const botResponse = data.choices[0].message.content;
        this.updateConversationHistory(userMessage, botResponse);
        return botResponse;
    }

    isValidResponse(response) {
        return response && 
               response.trim() && 
               !response.toLowerCase().includes("ciao! sono alice");
    }

    isBasicGreeting(message) {
        const greetings = new Set(['ciao', 'hey', 'buongiorno', 'buonasera', 'salve', 'hi', 'hello']);
        return greetings.has(message.toLowerCase().trim());
    }

    updateConversationHistory(userMessage, botResponse) {
        this.conversationHistory.push(
            { role: "user", content: userMessage },
            { role: "assistant", content: botResponse }
        );

        if (this.conversationHistory.length > EventiChatbot.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-EventiChatbot.MAX_HISTORY);
        }
    }

    getSystemPrompt() {
        return `Sei Alice, un'assistente virtuale amichevole e appassionata di Siena e della sua cultura.
            La data corrente è ${this.currentDate.toLocaleString('it-IT')}. 
            È FONDAMENTALE che tu consideri SOLO gli eventi che avvengono da questa data in poi.
            NON menzionare MAI eventi che avverranno tra più di un mese da oggi.

            IL TUO CARATTERE:
            - Sei entusiasta della cultura senese e lo dimostri nel modo in cui ne parli
            - Usi un linguaggio informale ma professionale
            - Fai spesso riferimenti personali a Siena e ai suoi luoghi
            - Mostri empatia e comprensione verso gli interessi dell'utente
            - Non ti limiti a elencare fatti, ma racconti storie e crei connessioni

            CONOSCENZA DI BASE:
            ${this.prepareEventsContext()}

            REGOLE IMPORTANTI:
            1. Rispondi SEMPRE in modo BREVE e CONCISO
            2. MAI salutare o presentarti di nuovo dopo il primo messaggio
            3. Parla SOLO di eventi dopo il ${this.currentDate.toLocaleDateString('it-IT')}
            4. Concentrati sui prossimi 7 giorni
            5. Se non ci sono eventi, suggerisci di controllare più avanti
            6. NON inventare eventi
            7. NON essere prolissa
            8. NON ripetere informazioni
            9. Puoi usare qualche emoticon dove serve, ma senza esagerare
            10. Sei un'assistente incentrato sugli eventi, ma se l'utente non ti parla degli eventi, non parlare solo di essi. Puoi parlare anche di cultura, storia, luoghi, ecc. e altre cose generiche.
            11. "Eventi" è plurale, dunque usa "ci sono" e non "c'è" e "programmati" e non "programmato".
            12. Non assumere che l'utente voglia sapere degli eventi, ma chiedi prima.
            13. Se l'utente chiede di non parlare di eventi, rispetta la richiesta e non rispondere con "Mi dispiace, puoi ripetere in altro modo?". Rispondi ad altre domande ma solo se non offensive.

            Data corrente: ${this.currentDate.toLocaleString('it-IT')}`;
    }

    prepareEventsContext() {
        const today = new Date(this.currentDate);
        today.setHours(0, 0, 0, 0);

        const todayEvents = [];
        const futureEvents = [];

        for (const event of this.events) {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            
            if (eventDate.getTime() === today.getTime()) {
                todayEvents.push(event);
            } else if (eventDate > today) {
                futureEvents.push(event);
                if (futureEvents.length >= 5) break;
            }
        }

        return `
            EVENTI DI OGGI (${today.toLocaleDateString('it-IT')}):
            ${this.formatEventsList(todayEvents)}

            PROSSIMI EVENTI:
            ${this.formatEventsList(futureEvents)}`;
    }

    formatEventsList(events) {
        if (!events.length) return 'Nessun evento programmato.';
        
        return events.map(event => 
            `Titolo: ${event.title}
            Data: ${event.date.toLocaleDateString('it-IT')}
            Luogo: ${event.extendedProps.location || 'Non specificato'}
            Orario: ${event.extendedProps.time || 'Non specificato'}
            ${event.extendedProps.price ? `Prezzo: ${event.extendedProps.price}` : ''}`
        ).join('\n\n');
    }

    isEventRelatedQuery(message) {
        const eventKeywords = new Set([
            'evento', 'eventi', 'concerto', 'mostra', 'spettacolo', 
            'oggi', 'domani', 'quando', 'dove', 'programma', 'calendario',
            'weekend', 'fine settimana', 'sabato', 'domenica' // Aggiunti keywords per il weekend
        ]);
        return message.toLowerCase().split(' ').some(word => eventKeywords.has(word));
    }

    searchLocalEvents(query) {
        query = query.toLowerCase();
        const today = new Date(this.currentDate);
        today.setHours(0, 0, 0, 0);
        const todayUTC = new Date(Date.UTC(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            0, 0, 0
        ));

        if (query.includes('oggi')) {
            const todayEvents = this.events.filter(event => {
                const eventDate = new Date(event.date);
                const eventUTC = new Date(Date.UTC(
                    eventDate.getFullYear(),
                    eventDate.getMonth(),
                    eventDate.getDate(),
                    0, 0, 0
                ));
                return eventUTC.getTime() === todayUTC.getTime();
            });

            if (todayEvents.length) {
                return this.formatSearchResults(todayEvents);
            }
            return "Oggi non ci sono eventi in programma. Vuoi scoprire i prossimi eventi?";
        }

        if (query.includes('prossim')) {
            const futureEvents = this.events.filter(event => {
                const eventDate = new Date(event.date);
                eventDate.setHours(0, 0, 0, 0);
                return eventDate >= today;
            }).slice(0, 3);

            if (futureEvents.length) {
                return this.formatSearchResults(futureEvents);
            }
        }

        const matchingEvents = this.events.filter(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            return (eventDate >= today) && 
                   query.split(' ')
                       .filter(term => term.length > EventiChatbot.MIN_SEARCH_TERM_LENGTH)
                       .some(term => event.searchText.includes(term.toLowerCase()));
        });

        if (matchingEvents.length) {
            return this.formatSearchResults(matchingEvents);
        }

        return "Mi dispiace, non ho trovato eventi che corrispondono alla tua ricerca. Posso aiutarti a trovare altri eventi?";
    }

    formatSearchResults(events) {
        return `Ho trovato questi eventi:\n\n${events.map(event =>
            `📅 ${event.title}\n` +
            `📆 Data: ${event.date.toLocaleDateString('it-IT')}\n` +
            `🏛️ Luogo: ${event.extendedProps.location}\n` +
            `⏰ Orario: ${event.extendedProps.time || 'Non specificato'}`
        ).join('\n\n')}`;
    }

    getGenericResponse() {
        const responses = [
            "Posso aiutarti a trovare eventi interessanti. Di che tipo di eventi sei interessato?",
            "Vuoi scoprire gli eventi in programma? Dimmi pure cosa ti interessa!",
            "Come posso aiutarti a trovare l'evento perfetto per te?"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    addMessage(message, type) {
        const { chatMessages } = this.elements;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = message.replace(/\n/g, '<br>');
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addTypingIndicator() {
        const { chatMessages } = this.elements;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingDiv;
    }
}

export function initChatbot(events) {
    if (events) {
        window.chatbot = new EventiChatbot(events);
        console.log('Chatbot initialized');
    }
}