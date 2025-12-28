import React, { useState, useEffect } from 'react'; //CollaboratorHistoryScreen.js
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';

// Importiamo il generatore PDF (Assicurati che il file si chiami CreatorePDF.js)
import { generatePDF } from './CreatorePDF';

const Colors = {
    background: '#000000',
    surface: '#1C1C1E',
    textMain: '#FFFFFF',
    textSub: '#8E8E93',
    primary: '#4CAF50',
    cyan: '#00D1FF',
    border: '#2C2C2E',
};

// NOTA BENE: Qui ricevo { onBack } da App.js
export default function CollaboratorHistoryScreen({ onBack }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState("Collaboratore");

    useEffect(() => {
        const fetchHistory = async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                // Recuperiamo Nome Utente
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists()) {
                    const d = userSnap.data();
                    setUserName(`${d.firstName} ${d.lastName}`);
                }

                // Recuperiamo Storico
                const q = query(collection(db, "shifts"), where("collaboratorId", "==", user.uid), where("status", "==", "completato"));
                const snapshot = await getDocs(q);
                const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
               
                // Ordine cronologico inverso (dal più recente)
                data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setHistory(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const handleDownloadPDF = () => {
        if (history.length === 0) {
            Alert.alert("Vuoto", "Non hai turni da scaricare.");
            return;
        }
        generatePDF(userName, history);
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                {/* Titolo Principale (Location) */}
                <Text style={styles.locationText}>{item.location}</Text>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={{color: Colors.primary, fontSize:10, fontWeight:'bold', marginRight:4}}>COMPLETATO</Text>
                    <Feather name="check-circle" size={14} color={Colors.primary} />
                </View>
            </View>
           
            <Text style={{ color: Colors.textSub, marginBottom: 10 }}>📅 {item.date}</Text>
           
            <View style={styles.detailBox}>
                <Text style={styles.value}>Orario: {item.startTime} - {item.endTime}</Text>
                {/* Qui mostriamo il luogo invece dei soldi */}
                <Text style={[styles.value, {color: Colors.cyan, marginTop:5}]}>
                    Luogo: {item.location}
                </Text>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
           
            {/* --- HEADER BLINDATO --- */}
            <View style={styles.header}>
                {/* Tasto Indietro (Usa onBack per tornare alla Home) */}
                <TouchableOpacity onPress={onBack} style={styles.leftButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textMain} />
                </TouchableOpacity>
               
                {/* Titolo (Centrato) */}
                <Text style={styles.title}>STORICO TURNI</Text>

                {/* Tasto Download (Posizione Assoluta Destra) */}
                <TouchableOpacity
                    onPress={handleDownloadPDF}
                    disabled={history.length===0}
                    style={styles.rightButton}
                >
                    <Feather name="download" size={24} color={history.length>0 ? Colors.cyan : Colors.textSub} />
                </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color={Colors.cyan} style={{marginTop: 50}} /> : (
                <FlatList
                    data={history}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    ListHeaderComponent={
                        history.length > 0 ?
                        <Text style={{color:Colors.textSub, marginBottom:15, fontSize:12, textAlign:'center'}}>
                            Premi l'icona in alto a destra 📥 per il PDF.
                        </Text> : null
                    }
                    ListEmptyComponent={<Text style={styles.empty}>Nessun turno completato in archivio.</Text>}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
   
    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        position: 'relative'
    },
   
    leftButton: { position: 'absolute', left: 20, padding: 10, zIndex: 10 },
    rightButton: { position: 'absolute', right: 20, padding: 10, zIndex: 10 },
   
    title: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
   
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    locationText: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold' },
    detailBox: { backgroundColor: '#000', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    value: { color: Colors.textMain, fontSize: 12, fontWeight: 'bold' },
    empty: { color: Colors.textSub, textAlign: 'center', marginTop: 50, fontStyle:'italic' }
});