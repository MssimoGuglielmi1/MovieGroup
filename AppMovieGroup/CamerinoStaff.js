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
const EditableField = ({ label, value, onChange, placeholder, isSecure = false, keyboard = 'default' }) => {
    // 1. Definiamo cosa NON è obbligatorio
    const isOptional = label.includes("Facoltativo");
    const isPasswordField = label.includes("Password");

    // 2. Il campo è "mancante" solo se: 
    // NON è opzionale AND NON è una password AND è effettivamente vuoto
    const isMissing = !isOptional && !isPasswordField && (!value || value.trim() === '');

    return (
        <View style={{ marginBottom: 15 }}>
            <Text style={styles.label}>{label}</Text>
            <View style={[
                styles.inputWrapper, 
                isMissing && { borderColor: Colors.error, borderWidth: 1.5 } // Rosso solo se mancano dati vitali
            ]}>
                <TextInput
                    style={styles.inputWithIcon}
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textSub}
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={isSecure}
                    keyboardType={keyboard}
                    autoCapitalize={label.includes("Email") || isPasswordField ? "none" : "sentences"}
                />
                <Feather 
                    name={isMissing ? "alert-circle" : "edit-3"} 
                    size={18} 
                    color={isMissing ? Colors.error : Colors.pencil} 
                    style={styles.pencilIcon} 
                />
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
       
        // Controllo Password
        if (newPassword || confirmPassword) {
            if (newPassword !== confirmPassword) {
                Alert.alert("Errore", "Le password non coincidono.");
                return;
            }
            if (newPassword.length < 6) {
                Alert.alert("Errore", "La password deve essere di almeno 6 caratteri.");
                return;
            }
            try {
                await updatePassword(auth.currentUser, newPassword);
            } catch (error) {
                Alert.alert("Errore Sicurezza", "Per cambiare la password devi aver fatto il login di recente. Esci e rientra.");
                return;
            }
        }

        setSaving(true);
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                nickname: nickname,
                phoneNumber: phoneNumber,
                codiceFiscale: codiceFiscale.toUpperCase(),
                iban: iban.toUpperCase()
            });
           
            setNewPassword('');
            setConfirmPassword('');

            setSaving(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

        } catch (error) {
            setSaving(false);
            Alert.alert("Errore", "Impossibile salvare i dati.");
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
                   
                    {/* PARTE FISSA */}
                    <View style={styles.readOnlySection}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                            <View>
                                <Text style={styles.label}>Nome Completo</Text>
                                <Text style={styles.staticValue}>{userData.firstName} {userData.lastName}</Text>
                               
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
                    />

                    <View style={styles.divider} />

                    <Text style={styles.sectionHeader}>SICUREZZA 🔐</Text>

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
