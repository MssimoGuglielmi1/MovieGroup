//StoricoFounder.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { calculateFiscalData } from './CalcolatriceFiscale'; // <--- IMPORT NUOVO

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', gold: '#EAB308', border: '#2C2C2E', purple: '#BF5AF2', error: '#FF453A'
};

export default function StoricoFounder({ navigation }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalSpent, setTotalSpent] = useState(0);

    useEffect(() => {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 60); 
        const pastDateStr = pastDate.toISOString().split('T')[0];

        const q = query(
            collection(db, "shifts"), 
            where("status", "==", "completato"),
            where("date", ">=", pastDateStr)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let total = 0;
            const data = snapshot.docs.map(doc => {
                const rawData = doc.data();
                
                // USIAMO LA CALCOLATRICE ESTERNA
                const { cost } = calculateFiscalData(rawData);
                
                total += parseFloat(cost);
                return { id: doc.id, ...rawData, realCost: cost };
            });

            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setHistory(data);
            setTotalSpent(total);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

// --- FUNZIONE CANCELLAZIONE INTELLIGENTE (Web + Mobile) ---
    const handleDeleteShift = (shiftId) => {
        
        // SE SIAMO SUL WEB (PC/Chrome/Safari) 💻
        if (Platform.OS === 'web') {
            // Usiamo il comando nativo dei browser
            if (window.confirm("⚠️ ELIMINARE TURNO?\n\nVuoi cancellare questo turno PER SEMPRE? Sparirà anche dal PDF.")) {
                deleteDoc(doc(db, "shifts", shiftId))
                    .then(() => {
                        // Opzionale: un piccolo alert di conferma o nulla
                        // alert("Eliminato!"); 
                    })
                    .catch((error) => {
                        console.log("Errore:", error);
                        alert("Errore durante l'eliminazione.");
                    });
            }
        } 
        
        // SE SIAMO SU APP (Android/iOS) 📱
        else {
            Alert.alert(
            "ELIMINARE TURNO? ⚠️",
            "Vuoi cancellare questo turno dallo storico? Attenzione: il turno verrà rimosso PER SEMPRE anche dal PDF e dai conteggi.",
                [
                    { text: "Annulla", style: "cancel" },
                    {
                        text: "ELIMINA PER SEMPRE",
                        style: "destructive",
                        onPress: async () => {
                            try {
                                await deleteDoc(doc(db, "shifts", shiftId));
                            } catch (error) {
                                Alert.alert("Errore", "Impossibile eliminare il turno.");
                            }
                        }
                    }
                ]
            );
        }
    };

    const renderItem = ({ item }) => {
        const isMinute = item.rateType === 'minute';
        const isLateStart = item.realStartTime && new Date(item.realStartTime) > new Date(item.date + 'T' + item.startTime);

        return (
<TouchableOpacity 
                style={styles.card} 
                activeOpacity={0.7} // <--- Aggiungi questo per l'effetto visivo
                onLongPress={() => handleDeleteShift(item.id)} // <--- IL GRILLETTO
                delayLongPress={2000} // <--- LA SICURA (2 Secondi)
            >
                <View style={styles.cardHeader}>
                    <View style={{flex: 1}}>
                        <Text style={styles.collabName}>{item.collaboratorName}</Text>
                        <Text style={styles.locationText}>{item.location}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                        <Text style={styles.moneyValue}>€ {item.realCost}</Text>
                        <Text style={[styles.rateLabel, isMinute ? {color: Colors.gold} : {color: Colors.accent}]}>
                            {isMinute ? `€${item.payoutRate}/min` : `€${item.payoutRate}/h`}
                        </Text>
                    </View>
                </View>
                <View style={styles.detailRow}>
                    <View>
                        <Text style={{ color: Colors.textSub, fontSize:10 }}>PREVISTO</Text>
                        <Text style={{ color: Colors.textSub, fontWeight:'bold' }}>{item.startTime} - {item.endTime}</Text>
                    </View>
                    {item.realStartTime && (
                         <View style={{alignItems:'flex-end'}}>
                            <Text style={{ color: isLateStart ? Colors.error : Colors.primary, fontSize:10 }}>
                                {isLateStart ? "RITARDO" : "PUNTUALE"}
                            </Text>
                            <Text style={{ color: Colors.textMain, fontWeight:'bold' }}>
                                {new Date(item.realStartTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - 
                                {item.realEndTime ? new Date(item.realEndTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..."}
                            </Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.leftButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.title}>COSTI AZIENDALI</Text>
            </View>
            <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>TOTALE EROGATO (REALE - 60 GG)</Text>
                <Text style={styles.summaryValue}>€ {totalSpent.toFixed(2)}</Text>
            </View>
            {loading ? <ActivityIndicator size="large" color={Colors.purple} style={{marginTop: 50}} /> : (
                <FlatList data={history} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={{ padding: 20, paddingBottom: 50 }} ListEmptyComponent={<Text style={styles.empty}>Nessun turno completato negli ultimi 60 giorni.</Text>} />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, position: 'relative' },
    leftButton: { position: 'absolute', left: 20, padding: 10, zIndex: 10 },
    title: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
    summaryBox: { margin: 20, padding: 20, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.gold, alignItems: 'center' },
    summaryLabel: { color: Colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
    summaryValue: { color: Colors.textMain, fontSize: 32, fontWeight: '900' },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    collabName: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold' },
    locationText: { color: Colors.textSub, fontSize: 12, marginTop: 2 },
    moneyValue: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
    rateLabel: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10, marginTop: 5 },
    empty: { color: Colors.textSub, textAlign: 'center', marginTop: 50, fontStyle:'italic' },
});
