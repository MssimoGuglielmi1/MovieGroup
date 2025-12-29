//WelcomeModal.js
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';

const Colors = {
    background: '#1C1C1E',
    primary: '#4CAF50',
    accent: '#0A84FF',
    text: '#FFFFFF',
    subText: '#A1A1AA',
    purple: '#A371F7',
    gold: '#EAB308',
    purple: '#A371F7',
    gold: '#EAB308',
    orange: '#FF9500', 
    error: '#FF453A',
    info: '#64748B',
};

// --- CONTENUTI DIVERSI PER RUOLO --- 'map-pin'

const STEPS_COLLABORATOR = [
    { 
        icon: 'settings', 
        color: Colors.primary, 
        title: '1. PROFILO E DATI', 
        desc: 'Vai in impostazioni (icona ingranaggio) e compila i tuoi dati personali, IBAN e documenti per abilitare i pagamenti.' 
    },
    { 
        icon: 'list', 
        color: Colors.primary, 
        title: '2. STORICO TURNI', 
        desc: 'Usa la sezione Storico per vedere velocemente tutti i tuoi turni passati, le ore lavorate e i guadagni accumulati.' 
    },
    { 
        icon: 'bar-chart-2', 
        color: Colors.primary, 
        title: '3. BACHECA PREVISIONI', 
        desc: 'Consulta la bacheca per visualizzare le stime di lavoro future e organizzare la tua disponibilità.' 
    },
    { 
        icon: 'check-square', 
        color: Colors.primary, 
        title: '4. GESTIONE INVITI', 
        desc: 'Quando ricevi un turno, ricordati di Accettare o Rifiutare subito. Se accetti, il turno apparirà nei tuoi operativi.' 
    },
    { 
        icon: 'map-pin', 
        color: Colors.primary, 
        title: '5. TIMBRA IL CARTELLINO', 
        desc: 'Segna la tua posizione premendo "START (GPS)". Puoi farlo a partire da 1 ora prima dell\'inizio effettivo del turno.' 
    },
    { 
        icon: 'flag', 
        color: Colors.primary, 
        title: '6. FINE TURNO', 
        desc: 'Al termine dell\'orario stabilito, il turno si concluderà automaticamente nel sistema.' 
    },
    { 
        icon: 'file-text', 
        color: Colors.primary, 
        title: '7. GESTIONE DOCUMENTI', 
        desc: 'L\'andamento preciso del turno è fondamentale per permettere al datore di lavoro di generare i PDF gestionali corretti.' 
    }
];

const STEPS_ADMIN = [
    { 
        icon: 'settings', 
        color: Colors.primary, 
        title: '1. PROFILO E DATI', 
        desc: 'Vai in impostazioni (ingranaggio) e compila i tuoi dati, IBAN e documenti per abilitare i pagamenti.' 
    },
    { 
        icon: 'phone', 
        color: Colors.primary, 
        title: '2. RUBRICA STAFF', 
        desc: 'Accedi alla lista completa dello staff per chiamare o contattare agevolmente i collaboratori.' 
    },
    { 
        icon: 'bar-chart-2', 
        color: Colors.primary, 
        title: '3. BACHECA PREVISIONI', 
        desc: 'Consulta le stime di lavoro future per organizzare la tua disponibilità e quella del team.' 
    },
    { 
        icon: 'user-plus', 
        color: Colors.primary, 
        title: '4. REGISTRAZIONI', 
        desc: 'Dal pannello registrazioni gestisci l\'accettazione o il rifiuto delle richieste di ingresso nel sistema.' 
    },
    { 
        icon: 'check-square', 
        color: Colors.primary, 
        title: '5. GESTIONE INVITI (TUOI)', 
        desc: 'Se ricevi un turno personale, ricordati di Accettare o Rifiutare subito per aggiornare gli operativi.' 
    },
    { 
        icon: 'map-pin', 
        color: Colors.primary, 
        title: '6. TIMBRA IL CARTELLINO', 
        desc: 'Se operi sul campo, premi "START (GPS)" da 1 ora prima dell\'inizio per segnare la posizione.' 
    },
    { 
        icon: 'flag', 
        color: Colors.primary, 
        title: '7. FINE TURNO', 
        desc: 'Al termine dell\'orario, il turno si chiude in automatico. Verifica che tutto sia corretto.' 
    },
    { 
        icon: 'file-text', 
        color: Colors.primary, 
        title: '8. GESTIONE DOCUMENTI', 
        desc: 'La precisione degli orari è fondamentale per generare i PDF gestionali corretti per il datore di lavoro.' 
    },
    { 
        icon: 'plus-circle', 
        color: Colors.primary, // Verde brillante
        title: '9. ASSEGNA UN TURNO', 
        desc: 'Col tasto verde invii richieste di turno. Puoi monitorare se vengono accettate o rifiutate nella gestione turni.' 
    },
    { 
        icon: 'edit-3', 
        color: Colors.primary, 
        title: '10. MODIFICA TURNO', 
        desc: 'Dalla lista operativi puoi cliccare e modificare un turno in caso di errore. Le modifiche vengono tracciate.' 
    }
];

// --- 3. CONTENUTI LEGENDA STAFF (NUOVO!) ---
const STEPS_LEGEND = [
    { icon: 'file-text', color: Colors.accent, title: 'INFO', desc: 'Da qui attualmente hai a portata di mano e click: CF & IBAN (Se compilati).                                            P.S. il tuo staff ha un avviso che gli ricorda di compilare tutti i campi, qualora non fossero compilati.' },
    { icon: 'refresh-cw', color: Colors.purple, title: 'IL CAMBIO RUOLO', desc: 'Premendo sul tasto "CAMBIO RUOLO", permetterai ad un COLLABORATORE di diventare AMMINISTRATORE e viceversa.' },
    { icon: 'lock', color: Colors.orange, title: 'BLOCCO TEMPORANEO', desc: 'Selezionando il pulsante "LUCCHETTO", impedirai al profilo di accedere in app, senza cancellare il suo store dal database di firestore.' },
    { icon: 'phone', color: Colors.primary, title: 'CHIAMATA AGILE', desc: 'Avvia una chiamata diretta al numero registrato (Se registrato).                  P.S. il tuo staff ha un avviso che gli ricorda di compilare tutti i campi, qualora non fossero compilati.' },
    { icon: 'trash-2', color: Colors.error, title: 'LICENZIA', desc: 'Dal tasto a forma di cestino, fai: SPARIRE DEFINITIVAMENTE PER SEMPRE SENZA POSSIBILITà DI RECUPERO INFO, LUTENTE (CONSIGLIO VIVAMENTE DI LICENZIARE SOLO DOPO AVER FATTO LA BUSTA PAGA, NEL MENTRE PREMI IL LUCCHETTO COSI GLI IMPEDISCI LACCESSO IN APP, PER QUALSIASI DOMANDA CHIAMAMI BY MASSIMO).' }
];
const STEPS_LEGEND_ADMIN = [
    { icon: 'lock', color: Colors.orange, title: 'CONGELA (Arancione)', desc: 'Blocca temporaneamente l\'accesso.' },
    { icon: 'phone', color: Colors.primary, title: 'CHIAMA (Verde)', desc: 'Avvia una chiamata diretta.' },
    { icon: 'info', color: Colors.info, title: 'LEGENDA (Grigio)', desc: 'Spiegazione icone.' },
    { icon: 'trash-2', color: Colors.error, title: 'ELIMINA (Rosso)', desc: 'Rimuove il collaboratore.' }
];

export default function WelcomeModal({ visible, onClose, userRole }) {
    
// DECIDIAMO QUALI DATI MOSTRARE
    let dataToShow = STEPS_COLLABORATOR; // Default
    let titleText = "BENVENUTO NEL TEAM 👋";
    let subTitleText = "Guida rapida alle tue funzioni"; // Testo di default

    if (userRole === 'AMMINISTRATORE' || userRole === 'ADMIN') {
        dataToShow = STEPS_ADMIN;
        titleText = "PANNELLO DI CONTROLLO 🛠️";
    } 
    // 🔥 CASO LEGENDA (Quello che ci serve ora) 🔥
    else if (userRole === 'LEGEND') {
        dataToShow = STEPS_LEGEND;
        titleText = "LEGENDA COMANDI ℹ️";
        subTitleText = "Significato delle icone gestionali";
    }
    // Caso Founder (Usa gli step Admin ma con titolo da Re)
    else if (userRole === 'FOUNDER') {
        dataToShow = STEPS_ADMIN; 
        titleText = "AMMINISTRAZIONE SUPREMA 👑";
    }
    // 🔥 CASO LEGENDA ADMIN 🔥
    else if (userRole === 'LEGEND_ADMIN') {
        dataToShow = STEPS_LEGEND_ADMIN;
        titleText = "LEGENDA ADMIN 🛡️";
        subTitleText = "Strumenti Gestione Staff";
    }

    return (
        <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>{titleText}</Text>
                        <Text style={styles.subtitle}>Guida rapida alle tue funzioni</Text>
                    </View>

                    <ScrollView contentContainerStyle={styles.content}>
                        {dataToShow.map((step, index) => (
                            <View key={index} style={styles.stepBox}>
                                <View style={[styles.iconCircle, { backgroundColor: step.color + '20' }]}>
                                    <Feather name={step.icon} size={24} color={step.color} />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text style={[styles.stepTitle, { color: step.color }]}>{step.title}</Text>
                                    <Text style={styles.stepDesc}>{step.desc}</Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Footer */}
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeText}>HO CAPITO</Text>
                    </TouchableOpacity>

                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    container: { width: '100%', maxHeight: '80%', backgroundColor: Colors.background, borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#333' },
    header: { alignItems: 'center', marginBottom: 25, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 20 },
    title: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'center', letterSpacing: 0.5 },
    subtitle: { fontSize: 14, color: Colors.subText, marginTop: 5 },
    content: { paddingBottom: 10 },
    stepBox: { flexDirection: 'row', marginBottom: 25, alignItems: 'flex-start' },
    iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
    textBlock: { flex: 1, justifyContent: 'center' },
    stepTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 4, letterSpacing: 0.5 },
    stepDesc: { fontSize: 13, color: Colors.subText, lineHeight: 18 },
    closeBtn: { backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: 16, alignItems: 'center', marginTop: 10 },
    closeText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 1 }
});
