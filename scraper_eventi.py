import os
import re
import json
import time
from groq import Groq
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from dotenv import load_dotenv

# Carica le variabili d'ambiente dal file .env
load_dotenv()

def extract_event_details(driver):
    wait = WebDriverWait(driver, 10)

    def get_text_by_selector(selector):
        try:
            element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
            return element.text
        except:
            return "N/A"

    try:
        # Estrai e normalizza la data
        data_element = driver.find_element(by='xpath', value='//div[@class="eventTime"]')
        data = reformat_date(data_element.text) if data_element else "N/A"

        # Estrai il titolo
        titolo_element = driver.find_element(by='xpath', value='//h2[@itemprop="name"]')
        titolo = titolo_element.text if titolo_element else "N/A"

        # Estrai la descrizione
        desc_element = driver.find_element(by='xpath', value='//div[@itemprop="description"]')
        descrizione = desc_element.text if desc_element else "N/A"

        # Estrai il prezzo
        prezzi_elements = driver.find_elements(By.XPATH, '//ul[@class="evt_ticket"]/li')
        prezzi = [elem.text for elem in prezzi_elements] if prezzi_elements else ["N/A"]

        # Estrai l'orario
        orario_elements = driver.find_elements(By.XPATH, '//ul[@class="evt_time"]/li/strong')
        orario = orario_elements[0].text if orario_elements else "N/A"

        # Estrai il luogo
        luogo_element = driver.find_element(by='xpath', value='//div[@class="luogo_eventi bgc1 c2"]/a/h5')
        luogo = luogo_element.text if luogo_element else "N/A"

        return {
            'Titolo evento': titolo,
            'Descrizione di Virgilio.it': descrizione,
            'Data': data,
            'Prezzo': prezzi,
            'Orario': orario,
            'Luogo': luogo
        }
    except Exception as e:
        print(f"Errore nell'estrazione dei dettagli: {str(e)}")
        return None

def generate_event_description(event):
    client = Groq(api_key=os.getenv('GROQ_API_KEY'))
    messages = [
        {
            "role": "system",
            "content": ("Sei un assistente che genera descrizioni di eventi. "
                       "Puoi ragionare internamente ma DEVI separare i tuoi "
                       "pensieri dalla descrizione finale usando una riga con "
                       "tre asterischi '***'. "
                       "Tutto ciò che scrivi dopo gli asterischi sarà considerato "
                       "la descrizione finale.")
        },
        {
            "role": "user",
            "content": (f"Descrivi questo evento:\n"
                       f"Titolo: {event['Titolo evento']}\n"
                       f"Data: {event['Data']}\n"
                       f"Luogo: {event['Luogo']}\n"
                       f"Orario: {event['Orario']}\n"
                       f"Prezzo: {', '.join(event['Prezzo']) if isinstance(event['Prezzo'], list) else event['Prezzo']}")
        }
    ]

    try:
        chat_completion = client.chat.completions.create(
            messages=messages,
            model="deepseek-r1-distill-llama-70b",
            max_tokens=10000,
            temperature=0.7
        )
        
        # Prendi solo la parte dopo i tre asterischi
        full_response = chat_completion.choices[0].message.content
        parts = full_response.split('***')
        
        # Se ci sono gli asterischi, prendi l'ultima parte, altrimenti prendi tutto
        description = parts[-1].strip() if len(parts) > 1 else full_response.strip()
        
        # Normalizza la formattazione
        description = re.sub(r'\n+', ' ', description)  # Sostituisci newline con spazi
        description = ' '.join(description.split())  # Normalizza gli spazi
        description = description[0].upper() + description[1:] if description else description
        
        return description

    except Exception as e:
        print(f"Errore nella generazione della descrizione: {str(e)}")
        return None

def reformat_date(date_str):
    months = {'Gen': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mag': '05',
              'Giu': '06', 'Lug': '07', 'Ago': '08', 'Set': '09', 'Ott': '10',
              'Nov': '11', 'Dic': '12'}
    date_str = re.sub(r'\s+', ' ', date_str.strip())
    
    if re.match(r'\d{1,2} \w{3}', date_str):
        day, month = date_str.split()
        return f"{int(day)}/{months[month]}"
    elif re.match(r'Dal \d{1,2} \w{3} Al \d{1,2} \w{3}', date_str):
        date_parts = re.findall(r'\d{1,2} \w{3}', date_str)
        start_day, start_month = date_parts[0].split()
        end_day, end_month = date_parts[1].split()
        return f"Dal {int(start_day)}/{months[start_month]} al {int(end_day)}/{months[end_month]}"
    
    return date_str

def save_to_json(new_data):
    file_path = 'eventi_siena.json'
    
    # Filtra gli eventi None o non validi
    new_data = [event for event in new_data if event is not None]
    
    existing_data = []
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as json_file:
                existing_data = json.load(json_file)
        except json.JSONDecodeError:
            existing_data = []
    
    # Crea una chiave univoca per ogni evento
    existing_event_ids = {
        (event['Titolo evento'], event['Data'], event['Luogo']) 
        for event in existing_data
    }
    
    unique_new_data = [
        event for event in new_data 
        if (event['Titolo evento'], event['Data'], event['Luogo']) not in existing_event_ids
    ]

    all_events = existing_data + unique_new_data
    
    try:
        with open(file_path, 'w', encoding='utf-8') as json_file:
            json.dump(all_events, json_file, ensure_ascii=False, indent=4)
        return len(unique_new_data), len(existing_data), unique_new_data
    except Exception as e:
        print(f"Errore nel salvataggio del file JSON: {str(e)}")
        return 0, 0, []

def scrape_events():
    start_time = time.time()
    print("Web Scraping in esecuzione.")
    
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--log-level=3")

    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        driver.get('https://www.virgilio.it/italia/siena/eventi/concerti')

        wait = WebDriverWait(driver, 10)
        # Accetta i cookie
        try:
            cookie_button = wait.until(
                EC.element_to_be_clickable((By.XPATH, '//*[@id="iol_cmp_cont_senz_acce"]'))
            )
            cookie_button.click()
            
            accept_necessary_button = wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, ".ubl-ncs__btn--reject"))
            )
            accept_necessary_button.click()
            print("Cookie consent accepted.")
        except Exception as e:
            print("Nessun banner dei cookie trovato o già accettato:", e)

        # Trova tutti i link degli eventi
        wait.until(EC.presence_of_all_elements_located((By.XPATH, '//h2/a[@itemprop="url"]')))
        event_links = [
            element.get_attribute("href")
            for element in driver.find_elements(By.XPATH, '//h2/a[@itemprop="url"]')
        ]

        # Cicla su ogni link e fai lo scraping
        events_data = []
        for link in event_links:
            try:
                driver.get(link)
                event_details = extract_event_details(driver)
                if event_details:
                    event_details['Descrizione Groq'] = generate_event_description(event_details)
                    events_data.append(event_details)
                    print(f"Scraping eseguito con successo per: {event_details['Titolo evento']}")
            except Exception as e:
                print(f"Errore nello scraping su {link}: {str(e)}")

        # Salva i dati in JSON
        new_entries, existing_entries, unique_data = save_to_json(events_data)
        print(f"{new_entries} nuove voci aggiunte al JSON. Voci totali nel file: {existing_entries + new_entries}.")
    
    except Exception as e:
        print("Errore nello scraping:", e)
    finally:
        if driver:
            driver.quit()

    print(f"Tempo totale di esecuzione: {time.time() - start_time:.2f} secondi.")

if __name__ == "__main__":
    scrape_events()