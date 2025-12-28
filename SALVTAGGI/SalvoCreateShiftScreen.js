import React, { useState, useCallback } from 'react'; // RIGA 1 CreateShiftScreen.js
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native'; // RIGA 14
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker'; // RIGA 19


const Colors = { // RIGA 22
    background: '#0D1117',
    surface: '#161B22',
    textPrimary: '#F0F6FC',
    textFaded: '#8B949E',
    accentCyan: '#00D1FF',
    accentGreen: '#238636',
    accentRed: '#DA3633',
    primaryAction: '#1F6FEB',
    divider: '#30363D',
};

// =======================================================================
// --- MAIN COMPONENT: CREATE SHIFT SCREEN ---
// =======================================================================


export default function CreateShiftScreen({ navigation, route }) { // RIGA 39
    // AGGIUNGI creatorId alla destrutturazione
    const { activeCollaborators = [], creatorId } = route?.params ?? {}; // RIGA 41

   
 
    const [loading, setLoading] = useState(false); // RIGA 45

    // --- STATI FORM --- 
    const [location, setLocation] = useState(''); // RIGA 48
    const [payAmount, setPayAmount] = useState(''); // RIGA 49
   
    // Collaboratore selezionato: memorizza l'ID e il Nome
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState(null); // RIGA 52
    const [selectedCollaboratorName, setSelectedCollaboratorName] = useState(''); // RIGA 53

    // Stati per Date/Time Picker
    const [date, setDate] = useState(new Date()); // RIGA 56
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false); // RIGA 61


    // Funzione helper per la gestione del cambio di data/ora
    const onChangeDate = (event, selectedDate) => { // RIGA 65
        const currentDate = selectedDate || date;
        setShowDatePicker(false);
        setDate(currentDate);
    }; // RIGA 69
    const onChangeStartTime = (event, selectedTime) => {
        const currentTime = selectedTime || startTime;
        setShowStartTimePicker(false);
        setStartTime(currentTime);
    }; // RIGA 74
    const onChangeEndTime = (event, selectedTime) => {
        const currentTime = selectedTime || endTime;
        setShowEndTimePicker(false);
        setEndTime(currentTime);
    }; //  RIGA 79


    // --- LOGICA SALVATAGGIO TURNO SU FIRESTORE ---
    const handleSaveShift = async () => { // RIGA 83
       
        // 1. VALIDAZIONE DEI CAMPI CRITICI
        if (!location || !selectedCollaboratorId || !payAmount || !date || !startTime || !endTime) { // RIGA 86
            Alert.alert("Attenzione", "Per favore, compila tutti i campi obbligatori.");
            return;
        } /// RIGA 89
       
// RIGA 91: PREPARAZIONE DEI DATI

        const shiftData = { // RIGA 93
            // Dati utente assegnato (Collaborator ID è Obbligatorio)
            collaboratorId: selectedCollaboratorId,
            collaboratorName: selectedCollaboratorName, // Campo aggiunto per visibilità rapida in DB RIGA 96
            // CAMPI AGGIUNTI PER LA GESTIONE BUSTE PAGA E TRACCIABILITÀ:
            createdBy: creatorId,
            payoutRate: parseFloat(payAmount), // Cruciale per buste paga RIGA 99
            //createdBy: currentUser.uid, // <--- ATTENZIONE: currentUser.uid NON è disponibile qui.
                                         // Lo aggiungeremo dopo aver ricevuto il codice da Founder/AdminHome.js

            // Dettagli Turno
            location: location, // RIGA 104

            // Dettagli Data/Ora
            date: date.toISOString().split('T')[0], // Mappato su 'date' come concordato // RIGA 107
            startTime: startTime.toTimeString().split(' ')[0].substring(0, 5),
            endTime: endTime.toTimeString().split(' ')[0].substring(0, 5), // RIGA 109

            // Stato e Metadati
            status: 'assegnato', // RIGA 112
            createdAt: Timestamp.now(),
        }; // RIGA 114

        try { // RIGA 116
            // 3. SALVATAGGIO SU FIRESTORE nella collezione 'shifts'
            await addDoc(collection(db, "shifts"), shiftData); // RIGA 118

            setLoading(false); // RIGA 120
            Alert.alert("Successo!", `Turno assegnato a ${selectedCollaboratorName} con successo!`); // RIGA 121
           
            // 4. RESET DEI CAMPI DOPO IL SUCCESSO
            setLocation(''); // RIGA 124
            setPayAmount('');
            setSelectedCollaboratorId(null);
            setSelectedCollaboratorName(''); // RIGA 127

        } catch (error) { // RIGA 129
            setLoading(false);
            console.error("Errore salvataggio turno:", error);
            Alert.alert("Errore", "Impossibile salvare il turno. Riprova.");
        }
    }; // RIGA 134


    // --- RENDER ( PER ME è UN VERO E PROPRIO LABIRINTO INCASINATO CHE NON RIESCO A COMPRENDERE E MODIFICARE ) ---
    const styles = getStyles(); // Otteniamo gli stili con i colori RIGA 138
   
// RIGA 137: Sostituisci il blocco di costruzione di collaboratorPickerItems qui sotto:
// Costruiamo la lista di Picker Items
const collaboratorPickerItems = activeCollaborators.map(user => ( // RIGA 142
    <Picker.Item
        key={user.id}
        label={`${user.firstName} ${user.lastName} (${user.role})`}
        value={user.id}
    />
)); // RIGA 148

// Aggiungiamo l'opzione "Seleziona" se non è già stata selezionata
collaboratorPickerItems.unshift( // RIGA 151
    <Picker.Item key="none" label="— Seleziona Collaboratore —" value={null} />
); // RIGA 153

    return ( // RIGA 155
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

            <View style={styles.headerContainer}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Crea Nuovo Turno</Text>
                <View style={styles.iconButtonPlaceholder} /> {/* Spacer RIGA 164 */}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
               
                <Text style={styles.sectionTitle}>Dettagli Assegnazione</Text>

                {/* 1. SELEZIONE COLLABORATORE RIGA 171 (LISTA PASSATA) */}
<View style={styles.pickerContainer}>
    <Picker // Usiamo SOLO il tag <Picker> corretto RIGA 173
        selectedValue={selectedCollaboratorId}
        onValueChange={(itemValue, itemIndex) => {
            if (itemValue) {
                // Trova il nome completo per il salvataggio RIGA 177
                const selectedUser = activeCollaborators.find(user => user.id === itemValue);
                setSelectedCollaboratorId(itemValue);
                setSelectedCollaboratorName(
                    `${selectedUser.firstName} ${selectedUser.lastName}`
                );
            } else { // RIGA 183
                setSelectedCollaboratorId(null);
                setSelectedCollaboratorName('');
            }
        }} // RIGA 187
        style={styles.picker}
        itemStyle={styles.pickerItem}
    >
        {collaboratorPickerItems}
    </Picker>
</View>
                {/* 2. LOCALE / LUOGO - RIGA 194 */}
                <Text style={styles.label}>Locale / Luogo</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Esempio: Bar Centrale Firenze"
                    placeholderTextColor={Colors.textFaded}
                    value={location}
                    onChangeText={setLocation}
                />
                {/* 3. PAGA (IMPORTO) - RIGA 203 */}
                <Text style={styles.label}>Paga Totale (€)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Esempio: 120 (Importo per l'intero turno)"
                    placeholderTextColor={Colors.textFaded}
                    keyboardType="numeric"
                    value={payAmount}
                    onChangeText={setPayAmount}
                />
               
                <Text style={styles.sectionTitle}>Orari</Text>

                {/* 4. SELEZIONE DATA/ORA - RIGA 216 */}
                <View style={styles.dateTimeRow}>
                   
                    {/* Data Turno - RIGA 219 */}
                    <View style={styles.datePickerContainer}>
                        <Text style={styles.label}>Data</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                            <Text style={styles.dateButtonText}>{date.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Ora Inizio - RIGA 227 */}
                    <View style={styles.timePickerContainer}>
                        <Text style={styles.label}>Inizio</Text>
                        <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={styles.dateButton}>
                            <Text style={styles.dateButtonText}>{startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </TouchableOpacity>
                    </View>
                   
                    {/* Ora Fine - RIGA 235 */}
                    <View style={styles.timePickerContainer}>
                        <Text style={styles.label}>Fine</Text>
                        <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={styles.dateButton}>
                            <Text style={styles.dateButtonText}>{endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </TouchableOpacity>
                    </View>
                   
                </View>

                {/* SHOW DATE/TIME PICKERS - RIGA 245 */}
                {showDatePicker && (
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="default"
                        onChange={onChangeDate}
                    />
                )}
                {showStartTimePicker && (
                    <DateTimePicker
                        value={startTime}
                        mode="time"
                        display="default"
                        onChange={onChangeStartTime}
                    />
                )}
                {showEndTimePicker && (
                    <DateTimePicker
                        value={endTime}
                        mode="time"
                        display="default"
                        onChange={onChangeEndTime}
                    />
                )}
               
                {/* BOTTONE SALVA TURNO - RIGA 271 */}
                <TouchableOpacity
                    style={styles.button}
                    onPress={handleSaveShift}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>SALVA E ASSEGNA TURNO</Text>
                    )}
                </TouchableOpacity>


            </ScrollView>
        </SafeAreaView>
    );
} // RIGA 288

// =======================================================================
// --- STYLES (Utilizza una funzione per includere i Colori) ---
// =======================================================================

const getStyles = () => StyleSheet.create({ // RIGA 294
    safeArea: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    }, // RIGA 299
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.divider,
    }, // RIGA 308
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.textPrimary,
    }, // RIGA 313
    iconButton: {
        padding: 5,
    },
    iconButtonPlaceholder: { // Per centrare il titolo RIGA 317
        width: 34,
    }, 
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    }, // RIGA 323
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.accentCyan,
        marginTop: 20,
        marginBottom: 15,
    }, // RIGA 330
    label: {
        color: Colors.textPrimary,
        marginBottom: 8,
        fontSize: 14,
        marginLeft: 4,
    }, // RIGA 336
    input: {
        backgroundColor: Colors.surface,
        color: Colors.textPrimary,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        marginBottom: 20,
        fontSize: 16,
        borderWidth: 1,
        borderColor: Colors.divider,
    }, // RIGA 347
    pickerContainer: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.divider,
        overflow: 'hidden',
    }, // RIGA 355
    picker: {
        color: Colors.textPrimary,
        // Su Android, l'altezza del Picker può essere impostata qui
    },
    pickerItem: {
        color: Colors.textPrimary,
    },
    dateTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    datePickerContainer: {
        flex: 2.5,
        marginRight: 10,
    },
    timePickerContainer: {
        flex: 1.7,
    },
    dateButton: {
        backgroundColor: Colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.divider,
        alignItems: 'center',
    },
    dateButtonText: {
        color: Colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    button: {
        backgroundColor: Colors.accentGreen,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 20,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
}); // RIGA 401
