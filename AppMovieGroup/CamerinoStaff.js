// CamerinoStaff.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', border: '#2C2C2E', error: '#FF453A',
    success: '#34C759',
    pencil: '#FFD700'
};

// --- COMPONENTE SPOSTATO FUORI (COSI NON SI RICARICA OGNI VOLTA) ---
const EditableField = ({ label, value, onChange, placeholder, isSecure = false, keyboard = 'default', autoComplete = 'on' }) => {
    // Stato locale per mostrare/nascondere la password
    const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
    
    const isOptional = label.includes("Facoltativo");
    const isPasswordField = label.includes("Password");
    const isMissing = !isOptional && !isPasswordField && (!value || value.trim() === '');

    return (
        <View style={{ marginBottom: 15 }}>
            <Text style={styles.label}>{label}</Text>
            <View style={[
                styles.inputWrapper, 
                isMissing && { borderColor: Colors.error, borderWidth: 1.5 }
            ]}>
                <TextInput
                    style={styles.inputWithIcon}
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textSub}
                    value={value}
                    onChangeText={onChange}
                    // Se è un campo password, usiamo lo stato per decidere se nascondere
                    secureTextEntry={isPasswordField ? !isPasswordVisible : false}
                    keyboardType={keyboard}
                    autoCapitalize={label.includes("Email") || isPasswordField ? "none" : "sentences"}
                    // --- 🛡️ AGGIUNGI QUESTE 3 RIGHE PER BLOCCARE L'AUTOFILL ---
    autoComplete="off"
    textContentType="none"
    importantForAutofill="no"
                />
                
                {/* TASTO OCCHIOLINO (Solo se è un campo password) */}
                {isPasswordField ? (
                    <TouchableOpacity 
                        onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                        style={styles.pencilIcon}
                    >
                        <Feather 
                            name={isPasswordVisible ? "eye" : "eye-off"} 
                            size={18} 
                            color={Colors.pencil} 
                        />
                    </TouchableOpacity>
                ) : (
                    <Feather 
                        name={isMissing ? "alert-circle" : "edit-3"} 
                        size={18} 
                        color={isMissing ? Colors.error : Colors.pencil} 
                        style={styles.pencilIcon} 
                    />
                )}
            </View>
        </View>
    );
};
// ------------------------------------------------------------------

export default function CamerinoStaff({ navigation }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
   
    // Dati
    const [userData, setUserData] = useState({});
   
    // Campi Modificabili
    const [nickname, setNickname] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [codiceFiscale, setCodiceFiscale] = useState('');
    const [iban, setIban] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
   
    // Password
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        const fetchUserData = async () => {
            const user = auth.currentUser;
            if (user) {
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUserData(data);
                    setFirstName(data.firstName || '');
                    setLastName(data.lastName || '');
                    setNickname(data.nickname || '');
                    setPhoneNumber(data.phoneNumber || '');
                    setCodiceFiscale(data.codiceFiscale || '');
                    setIban(data.iban || '');
                }
            }
            setLoading(false);
        };
        fetchUserData();
    }, []);

const handleSave = async () => {
        Keyboard.dismiss();
        
        // 1. PULIZIA E CONTROLLO PASSWORD 🔐
        const cleanPw = newPassword.trim();
        const cleanConfirm = confirmPassword.trim();

        if (cleanPw !== '' || cleanConfirm !== '') {
            if (cleanPw !== cleanConfirm) {
                const msg = "Le password inserite non coincidono. Controlla bene!";
                if (Platform.OS === 'web') alert(msg);
                else Alert.alert("Errore", msg);
                return;
            }
            
            if (cleanPw.length < 6) {
                const msg = "La password deve essere di almeno 6 caratteri.";
                if (Platform.OS === 'web') alert(msg);
                else Alert.alert("Errore", msg);
                return;
            }

            try {
                await updatePassword(auth.currentUser, cleanPw);
            } catch (error) {
                const msg = "Errore Sicurezza: Per cambiare la password devi aver fatto il login di recente. Effettua nuovamente l'accesso.";
                if (Platform.OS === 'web') alert(msg);
                else Alert.alert("Errore", msg);
                return;
            }
        }

        // 2. AGGIORNAMENTO DATI (LOGICA CHIRURGICA) 🧹
        setSaving(true);
        try {

            const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);

    try {
        
// 1. PULIZIA DATI
        const cleanCF = codiceFiscale.trim().toUpperCase().replace(/\s/g, '');

        // 2. REGEX VALIDAZIONE CODICE FISCALE (16 caratteri specifici) 🛡️
        const cfRegex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;

        // Controllo se il campo è vuoto
        if (cleanCF === '') {
            const msg = "Il Codice Fiscale è obbligatorio.";
            Platform.OS === 'web' ? alert(msg) : Alert.alert("Dato Mancante", msg);
            setSaving(false);
            return;
        }

        // Controllo se il formato è errato (blocca "caccola")
        if (!cfRegex.test(cleanCF)) {
            const msg = "Codice Fiscale non valido. Deve essere di 16 caratteri nel formato corretto.";
            Platform.OS === 'web' ? alert(msg) : Alert.alert("Errore Formato", msg);
            setSaving(false);
            return;
        }

        // 1. PULIZIA E VALIDAZIONE IBAN 🛡️
        const cleanIban = iban.trim().toUpperCase().replace(/\s/g, '');

        // REGEX IBAN ITALIANO: IT + 2 numeri + 1 lettera + 22 caratteri alfanumerici
        const ibanRegex = /^IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}$/;

        if (cleanIban === '') {
            const msg = "L'IBAN è obbligatorio per ricevere i pagamenti.";
            if (Platform.OS === 'web') alert(msg); else Alert.alert("Campo Mancante", msg);
            setSaving(false);
            return;
        }

        if (!ibanRegex.test(cleanIban)) {
            const msg = "L'IBAN inserito non è nel formato corretto (es. IT60...). Controlla di non aver inserito email o parole a caso.";
            if (Platform.OS === 'web') alert(msg); else Alert.alert("IBAN Non Valido", msg);
            setSaving(false);
            return;
        }

        // Se passa i controlli, prepariamo i dati per il database
        const updateData = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            codiceFiscale: cleanCF,
            iban: cleanIban, // Salviamo la versione pulita e in maiuscolo
            // ... altri campi
        };

        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, updateData);
        
        // ... (resto della logica di successo)
    } catch (error) {
        setSaving(false);
        // ... gestione errori
    }
};
            // Prepariamo solo i dati minimi obbligatori
            const updateData = {
                firstName: firstName.trim(),
                lastName: lastName.trim()
            };

            // Aggiungiamo i campi opzionali SOLO se non sono vuoti (così non salviamo stringhe "")
            if (nickname && nickname.trim() !== '') updateData.nickname = nickname.trim();
            if (phoneNumber && phoneNumber.trim() !== '') updateData.phoneNumber = phoneNumber.trim();

            // 👮 BLOCCO ANTI-MAIL NELL'IBAN
            if (iban && iban.includes('@')) {
                const errorMsg = "Errore: Stai provando a salvare una mail nel campo IBAN!";
                if (Platform.OS === 'web') alert(errorMsg);
                else Alert.alert("Dati Errati", errorMsg);
                setSaving(false);
                return;
            }

            if (codiceFiscale && codiceFiscale.trim() !== '') {
                updateData.codiceFiscale = codiceFiscale.trim().toUpperCase();
            }
            
            if (iban && iban.trim() !== '') {
                updateData.iban = iban.trim().toUpperCase();
            }

            // Inviamo l'aggiornamento a Firestore
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, updateData);
            
            // Aggiorniamo la vista locale
            setUserData(prev => ({ ...prev, ...updateData }));

            // Resettiamo i campi password e confermiamo il successo
            setNewPassword('');
            setConfirmPassword('');
            setSaving(false);
            setSaveSuccess(true);
            
            if (Platform.OS === 'web') alert("Profilo aggiornato con successo! ✅");
            setTimeout(() => setSaveSuccess(false), 3000);

        } catch (error) {
            setSaving(false);
            const errorMsg = "Errore durante il salvataggio: " + error.message;
            if (Platform.OS === 'web') alert(errorMsg);
            else Alert.alert("Errore", errorMsg);
        }
    };

    if (loading) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator color={Colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textMain} /></TouchableOpacity>
                <Text style={styles.title}>IL TUO CAMERINO</Text>
                <View style={{width:24}}/>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
               
                <View style={[styles.bigCard, saveSuccess && {borderColor: Colors.success}]}>
                   
{/* PARTE FISSA (Solo Email e Ruolo) */}
    <View style={styles.readOnlySection}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
            <View>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.staticValue}>{userData.email}</Text>
            </View>
            <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{userData.role}</Text>
            </View>
        </View>
    </View>

    <View style={styles.divider} />

    {/* PARTE MODIFICABILE */}
    <Text style={styles.sectionHeader}>DATI MODIFICABILI 🖋️</Text>

    <EditableField
        label="Nome"
        value={firstName}
        onChange={setFirstName}
        placeholder="Inserisci Nome"
    />

    <EditableField
        label="Cognome"
        value={lastName}
        onChange={setLastName}
        placeholder="Inserisci Cognome"
    />

                    {/* PARTE MODIFICABILE */}

                    <EditableField
                        label="Soprannome (Facoltativo)"
                        value={nickname}
                        onChange={setNickname}
                        placeholder="Es. Il Mago"
                    />

                    <EditableField
                        label="Cellulare"
                        value={phoneNumber}
                        onChange={setPhoneNumber}
                        placeholder="+39..."
                        keyboard="phone-pad"
                    />

                    <EditableField
                        label="Codice Fiscale"
                        value={codiceFiscale}
                        onChange={setCodiceFiscale}
                        placeholder="CF..."
                    />

                    <EditableField
                        label="IBAN"
                        value={iban}
                        onChange={setIban}
                        placeholder="IT..."
                        autoComplete="off"
                        textContentType="none"
                        importantForAutofill="no"
                    />

                    <View style={styles.divider} />

                    <Text style={styles.sectionHeader}>CAMBIA/CONFERMA PW 🔐</Text>

                    <EditableField
                        label="Nuova Password"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="Min. 6 caratteri"
                        isSecure={true}
                    />

                    <EditableField
                        label="Conferma Nuova Password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Ripeti password"
                        isSecure={true}
                    />

                    <TouchableOpacity
                        style={[styles.saveBtn, saveSuccess && styles.saveBtnSuccess]}
                        onPress={handleSave}
                        disabled={saving || saveSuccess}
                    >
                        {saving ? (
                            <ActivityIndicator color="#000"/>
                        ) : saveSuccess ? (
                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                <Feather name="check-circle" size={18} color="#000" style={{marginRight:8}}/>
                                <Text style={styles.saveBtnText}>SALVATO!</Text>
                            </View>
                        ) : (
                            <Text style={styles.saveBtnText}>AGGIORNA PROFILO</Text>
                        )}
                    </TouchableOpacity>

                </View>

                <Text style={styles.legal}>
                    I tuoi dati sensibili sono crittografati e visibili solo al tuo datore di lavoro per scopi contrattuali. 
                </Text>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    title: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
    scrollContent: { padding: 20, paddingBottom: 50 },
    bigCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border },
    label: { color: Colors.textSub, fontSize: 11, marginBottom: 4, fontWeight:'600' },
    staticValue: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
    roleBadge: { backgroundColor: Colors.accent+'20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    roleText: { color: Colors.accent, fontSize: 10, fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 15 },
    sectionHeader: { color: Colors.pencil, fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    inputWithIcon: { flex: 1, color: '#FFF', padding: 12, fontSize: 15 },
    pencilIcon: { paddingRight: 12 },
    saveBtn: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    saveBtnSuccess: { backgroundColor: Colors.success },
    saveBtnText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
    legal: { color: Colors.textSub, fontSize: 10, textAlign: 'center', marginTop: 15 }
});
