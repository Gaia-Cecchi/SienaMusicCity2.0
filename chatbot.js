class EventiChatbot {
    static MODEL = "llama-3.3-70b-versatile";
    static MAX_HISTORY = 6;
    static MIN_SEARCH_TERM_LENGTH = 3;

    constructor(events) {
        // Initialize core properties
        this.events = this.preprocessEvents(events);
        this.conversationHistory = [];
        
        // Usa la data corrente del sistema
        const now = new Date();
        // Imposta l'anno a 2025 mantenendo data e ora correnti
        this.currentDate = new Date(
            2025,
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );

        console.log('Current date set to:', this.currentDate.toLocaleString('it-IT')); // Debug log
        
        this.currentUser = 'Gaia-Cecchi';
        this.apiKey = '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';
        this.initialized = false;

        // Cache DOM elements
        this.elements = this.cacheDOMElements();
        
        // Clear chat messages
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = '';
        }

        this.setupEventListeners();
        this.addWelcomeMessage();

        // Aggiungi l'indice per il RAG
        this.eventIndex = this.createEventIndex(events);
    }

    preprocessEvents(events) {
        return events.map(event => {
            // Converti la data nel fuso orario italiano
            const dateParts = event.start.split('T')[0].split('-');
            const localDate = new Date(
                parseInt(dateParts[0]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[2]),
                1, 0, 0 // Imposta l'ora a 01:00 per assicurarsi che sia nel giorno corretto in CET
            );
            
            // Aggiungi un giorno
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

        // Aggiungi l'event listener per il click sia sull'header che sull'icona
        const chatHeader = document.querySelector('.chat-header');
        const toggleButton = document.getElementById('toggle-chat');
        
        const toggleChat = () => chatWidget.classList.toggle('minimized');
        
        if (chatHeader) chatHeader.addEventListener('click', toggleChat);
        if (toggleButton) toggleButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Previene il doppio trigger con il click dell'header
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
            // Usa lo stesso metodo di preprocessEvents per la coerenza delle date
            const dateParts = event.start.split('T')[0].split('-');
            const localDate = new Date(
                parseInt(dateParts[0]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[2]),
                1, 0, 0 // Imposta l'ora a 01:00 per assicurarsi che sia nel giorno corretto in CET
            );

            // Aggiungi un giorno
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
            return "Mi dispiace, non ho trovato eventi che corrispondono alla tua ricerca. Vuoi provare a cercare in un altro modo?";
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
            'oggi', 'domani', 'quando', 'dove', 'programma', 'calendario'
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