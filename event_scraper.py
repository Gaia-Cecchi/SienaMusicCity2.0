from taipy import Gui
import json

def load_events_from_json(path: str):
    """Carica eventi da un file JSON specificato."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except UnicodeDecodeError:
        # Se l'utf-8 fallisce, prova con latin-1
        with open(path, 'r', encoding='latin-1') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Errore: Il file {path} non è stato trovato.")
        return []
    except json.JSONDecodeError as e:
        print(f"Errore: Il file {path} non è un JSON valido. Dettagli: {e}")
        return []

# Percorso del file JSON
json_file_path = "Eventi_Virgilio.it_selenium_taipy.json"

# Carica gli eventi dal JSON
events = load_events_from_json(json_file_path)

if not events:  # Verifica se non ci sono eventi caricati
    print("Nessun evento trovato o errore durante il caricamento.")
else:
    print(f"Eventi caricati: {events}")

# Crea un formato per gli eventi
def prepare_events(data):
    """Prepara un formato per gli eventi."""
    prepared_events = []
    for event in data:
        try:
            prepared_events.append({
                "title": event.get("Titolo evento", "Titolo non disponibile"),
                "start": event.get("Data", "Data non specificata"),
                "description": event.get("Descrizione Groq") or event.get("Descrizione di Virgilio.it", "Descrizione non disponibile"),
                "location": event.get("Luogo", "Luogo non specificato"),
                "address": event.get("Indirizzo", "Indirizzo non specificato"),
                "extendedProps": {
                    "price": event.get("Prezzo", "Non disponibile"),
                    "time": event.get("Orario", "Orario non specificato")
                }
            })
        except Exception as e:
            print(f"Errore nella preparazione dell'evento: {e}")
    return prepared_events

# Prepara gli eventi
prepared_events = prepare_events(events)

# Controlla se ci sono eventi preparati
if not prepared_events:
    print("Nessun evento preparato.")
else:
    print(f"Eventi preparati: {prepared_events}")

# Converti gli eventi preparati in una stringa JSON
try:
    events_json = json.dumps(prepared_events, ensure_ascii=False)
except Exception as e:
    print(f"Errore nella serializzazione JSON: {e}")
    events_json = "[]"

# Definizione della pagina HTML
page = f"""
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8" />
    <title>Event Calendar</title>
    <link href='https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/5.11.3/main.min.css' rel='stylesheet' />
    <script src='https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/5.11.3/main.min.js'></script>
    <style>
        #calendar {{ max-width: 900px; margin: 20px auto; }}
    </style>
</head>
<body>
    <h1>Benvenuto nel nostro Event Scraper!</h1>
    <div id="calendar"></div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {{
            var calendarEl = document.getElementById('calendar');
            var calendar = new FullCalendar.Calendar(calendarEl, {{
                initialView: 'dayGridMonth',
                events: {events_json},
                eventContent: function(info) {{
                    let price = info.event.extendedProps.price;
                    let time = info.event.extendedProps.time;
                    return {{ html: `<b>${{info.event.title}}</b><br>${{time}} - ${{price}}` }};
                }},
                eventClick: function(info) {{
                    alert(`Descrizione: ${{info.event.extendedProps.description}}\\nLuogo: ${{info.event.extendedProps.location}}\\nIndirizzo: ${{info.event.extendedProps.address}}`);
                }}
            }});
            calendar.render();
        }});
    </script>
</body>
</html>
"""

# Crea l'istanza GUI e avvia l'applicazione
gui = Gui(page=page)

if __name__ == "__main__":
    gui.run()
