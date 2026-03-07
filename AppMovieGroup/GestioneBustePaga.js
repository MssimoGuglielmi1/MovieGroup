// GestioneBustePaga.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Picker } from '@react-native-picker/picker';

// Importiamo il database e il magazzino
import { auth, db, storage } from './firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, getDocs, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E', warning: '#EAB308'
};

export default function GestioneBustePaga({ navigation }) {
    const [role, setRole] = useState(null);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [buste, setBuste] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const currentUser = auth.currentUser;

    // --- 1. IDENTIFICAZIONE E LETTURA DATI ---
    useEffect(() => {
        if (!currentUser) return;

        const init = async () => {
            // Chi sono io?
            const userSnap = await getDoc(doc(db, "users", currentUser.uid));
            let myRole = 'COLLABORATORE';
            if (userSnap.exists()) myRole = userSnap.data().role;
            setRole(myRole);

            // Se sono un capo, mi serve la lista dello staff per scegliere a chi mandare il PDF
            if (myRole === 'FOUNDER' || myRole === 'AMMINISTRATORE') {
                const qUsers = query(collection(db, "users"), where("isApproved", "==", true));
                const snapUsers = await getDocs(qUsers);
                const staffList = snapUsers.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(u => u.role !== 'FOUNDER') // Non mando la busta a me stesso
                    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
                setUsers(staffList);
            }

            // Che buste paga devo vedere?
            // Se sono il Capo -> Vedo TUTTE quelle inviate. Se sono Dipendente -> Vedo SOLO le mie.
            let qBuste;
            if (myRole === 'FOUNDER' || myRole === 'AMMINISTRATORE') {
                qBuste = query(collection(db, "buste_paga"), orderBy("uploadedAt", "desc"));
            } else {
                qBuste = query(collection(db, "buste_paga"), where("collaboratorId", "==", currentUser.uid), orderBy("uploadedAt", "desc"));
            }

            const unsub = onSnapshot(qBuste, (snap) => {
                setBuste(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            });

            return () => unsub();
        };

        init();
    }, [currentUser]);

    // --- 2. CARICA IL PDF (SOLO ADMIN/FOUNDER) ---
    const handleUploadPDF = async () => {
        if (!selectedUser) {
            Alert.alert("Attenzione", "Devi prima selezionare un dipendente dal menu a tendina!");
            return;
        }

        try {
            // 1. Apri la galleria/file del telefono (Filtro solo PDF)
            const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
            if (result.canceled) return; // L'utente ha chiuso senza scegliere

            const file = result.assets[0];
            setUploading(true);

            // 2. Prepara il file per il viaggio (Funziona sia su Web che su Telefono)
            const response = await fetch(file.uri);
            const blob = await response.blob();

            // 3. Spedisci al Magazzino (Storage)
            const collabData = users.find(u => u.id === selectedUser);
            const collabName = `${collabData.firstName} ${collabData.lastName}`;
            const uniqueFileName = `${Date.now()}_${file.name}`;
            
            const storageRef = ref(storage, `buste_paga/${selectedUser}/${uniqueFileName}`);
            await uploadBytes(storageRef, blob);

            // 4. Prendi il Link Segreto
            const downloadUrl = await getDownloadURL(storageRef);

            // 5. Salva il Link nel Database (Firestore)
            await addDoc(collection(db, "buste_paga"), {
                collaboratorId: selectedUser,
                collaboratorName: collabName,
                fileName: file.name,
                storagePath: storageRef.fullPath,
                downloadUrl: downloadUrl,
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser.uid
            });

            if (Platform.OS === 'web') alert("Busta paga inviata con successo!");
            else Alert.alert("Fatto!", "Busta paga inviata con successo!");

            setSelectedUser(''); // Resetta la tendina

        } catch (error) {
            console.error(error);
            Alert.alert("Errore", "Impossibile caricare il file.");
        } finally {
            setUploading(false);
        }
    };

    // --- 3. SCARICA IL PDF ---
    const handleDownload = async (busta) => {
        if (Platform.OS === 'web') {
            // SU PC: Apri una nuova scheda col PDF
            window.open(busta.downloadUrl, '_blank');
        } else {
            // SU TELEFONO: Scarica e mostra il menu di condivisione/salvataggio
            try {
                const fileUri = FileSystem.documentDirectory + busta.fileName;
                const { uri } = await FileSystem.downloadAsync(busta.downloadUrl, fileUri);
                
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri);
                } else {
                    Alert.alert("Salvato", "File salvato nei tuoi documenti.");
                }
            } catch (error) {
                Alert.alert("Errore", "Impossibile scaricare il file.");
            }
        }
    };

    // --- 4. ELIMINA PDF (SOLO ADMIN/FOUNDER) ---
    const handleDelete = async (busta) => {
        const eseguiEliminazione = async () => {
            try {
                // 1. Elimina il file dal Magazzino
                const fileRef = ref(storage, busta.storagePath);
                await deleteObject(fileRef);

                // 2. Elimina la riga dal Database
                await deleteDoc(doc(db, "buste_paga", busta.id));

            } catch (error) {
                Alert.alert("Errore", "Impossibile eliminare il file.");
            }
        };

        if (Platform.OS === 'web') {
            if (confirm(`Vuoi davvero eliminare la busta paga di ${busta.collaboratorName}?`)) eseguiEliminazione();
        } else {
            Alert.alert("Elimina", `Vuoi davvero eliminare la busta paga di ${busta.collaboratorName}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "Elimina", style: "destructive", onPress: eseguiEliminazione }
            ]);
        }
    };

    // --- RENDER CARD SINGOLA BUSTA PAGA ---
    const renderBusta = ({ item }) => {
        const dataFormattata = new Date(item.uploadedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        const isCapo = role === 'FOUNDER' || role === 'AMMINISTRATORE';

        return (
            <View style={styles.card}>
                <View style={{flex: 1}}>
                    {isCapo && <Text style={styles.collabName}>{item.collaboratorName}</Text>}
                    <Text style={styles.fileName}>📄 {item.fileName}</Text>
                    <Text style={styles.dateText}>Inviato il: {dataFormattata}</Text>
                </View>
                
                <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.iconBtn, {backgroundColor: Colors.accent+'20'}]} onPress={() => handleDownload(item)}>
                        <Feather name="download" size={20} color={Colors.accent} />
                    </TouchableOpacity>
                    
                    {isCapo && (
                        <TouchableOpacity style={[styles.iconBtn, {backgroundColor: Colors.error+'20', marginLeft: 10}]} onPress={() => handleDelete(item)}>
                            <Feather name="trash-2" size={20} color={Colors.error} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    const isCapo = role === 'FOUNDER' || role === 'AMMINISTRATORE';

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color={Colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{isCapo ? "GESTIONE BUSTE PAGA" : "I TUOI DOCUMENTI"}</Text>
                <View style={{width: 24}}/>
            </View>

            <View style={styles.content}>
                
                {/* ZONA UPLOAD: Visibile SOLO ai Capi */}
                {isCapo && (
                    <View style={styles.uploadSection}>
                        <Text style={styles.sectionTitle}>INVIA UN NUOVO DOCUMENTO</Text>
                        
                        <View style={styles.pickerContainer}>
                            <Picker 
                                selectedValue={String(selectedUser)} 
                                onValueChange={(v) => setSelectedUser(String(v))} 
                                dropdownIconColor="#FFF" 
                                style={{color:'#FFF'}}
                                itemStyle={{ color: '#FFFFFF' }}
                            >
                                <Picker.Item label="Seleziona il Dipendente..." value="" color="#999"/>
                                {users.map(u => (
                                    <Picker.Item 
                                        key={u.id} 
                                        label={`${u.lastName} ${u.firstName}`} 
                                        value={u.id} 
                                        color={Platform.OS === 'ios' ? '#FFFFFF' : '#000000'} 
                                    />
                                ))}
                            </Picker>
                        </View>

                        <TouchableOpacity 
                            style={[styles.uploadBtn, !selectedUser && {opacity: 0.5}]} 
                            onPress={handleUploadPDF} 
                            disabled={uploading || !selectedUser}
                        >
                            {uploading ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <>
                                    <Feather name="upload" size={20} color="#000" style={{marginRight: 8}} />
                                    <Text style={styles.uploadBtnText}>CARICA PDF</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* ZONA LISTA: Visibile a tutti (ma filtrata prima) */}
                <Text style={styles.sectionTitle}>ARCHIVIO DOCUMENTI ({buste.length})</Text>
                <FlatList 
                    data={buste}
                    keyExtractor={item => item.id}
                    renderItem={renderBusta}
                    contentContainerStyle={{paddingBottom: 50}}
                    ListEmptyComponent={<Text style={styles.emptyText}>Nessun documento presente nell'archivio.</Text>}
                />

            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    loader: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
    content: { flex: 1, padding: 20 },
    uploadSection: { backgroundColor: Colors.surface, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: Colors.warning, marginBottom: 25 },
    sectionTitle: { color: Colors.textSub, fontSize: 12, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
    pickerContainer: { backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 15 },
    uploadBtn: { backgroundColor: Colors.warning, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 10 },
    uploadBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
    card: { backgroundColor: Colors.surface, padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
    collabName: { color: Colors.textMain, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
    fileName: { color: Colors.accent, fontSize: 13, fontWeight: 'bold' },
    dateText: { color: Colors.textSub, fontSize: 11, marginTop: 4 },
    actionRow: { flexDirection: 'row', alignItems: 'center' },
    iconBtn: { padding: 10, borderRadius: 8 },
    emptyText: { color: Colors.textSub, textAlign: 'center', marginTop: 20, fontStyle: 'italic' }
});