import React, { useState } from 'react'; // AdminStaffScreen.js
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

// =====================================================================
// --- 1. COMPONENTE CARD STAFF ---
// =====================================================================
const StaffCard = ({ user, onApprove, onReject, onDelete, mode, Colors }) => {

    const defaultColors = {
        accentCyan: '#00D1FF', accentRed: '#DA3633', accentPurple: '#A371F7', accentGreen: '#238636', surface: '#161B22', textPrimary: '#F0F6FC'
    };
    const finalColors = Colors || defaultColors;

    let primaryAction = null;
    let secondaryAction = null;
    let icon = 'user';
    let iconColor = finalColors.accentCyan;

    // Logica di visualizzazione delle azioni
    if (mode === 'PENDING_ADMINS' || mode === 'PENDING_ACCESS_ALL') {
        if (user.adminRequest === true && user.role === 'COLLABORATORE') {
            primaryAction = { icon: 'check', color: finalColors.accentPurple, func: onApprove };
            secondaryAction = { icon: 'x', color: finalColors.accentRed, func: onReject };
            icon = 'shield';
            iconColor = finalColors.accentPurple;
        } else if (user.isApproved === false) {
            primaryAction = { icon: 'check', color: finalColors.accentGreen, func: onApprove };
            secondaryAction = { icon: 'x', color: finalColors.accentRed, func: onDelete };
            icon = 'user-plus';
            iconColor = finalColors.accentGreen;
        }
    } else if (mode === 'ACTIVE_STAFF') {
        primaryAction = { icon: 'trash-2', color: finalColors.accentRed, func: onDelete };
        icon = user.role === 'AMMINISTRATORE' ? 'shield' : 'user';
        iconColor = user.role === 'AMMINISTRATORE' ? finalColors.accentPurple : finalColors.accentCyan;
    }

    const nameDisplay = user.firstName || user.email;

    return (
        <View style={styles(finalColors).cardItem}>
            <View style={[styles(finalColors).roleIcon, { backgroundColor: iconColor + '15' }]}>
                <Feather name={icon} size={18} color={iconColor} />
            </View>

            <View style={{flex: 1, paddingHorizontal: 12}}>
                <Text style={styles(finalColors).cardTitle}>{nameDisplay}</Text>
                <Text style={styles(finalColors).cardSubtitle}>Ruolo: {user.role || 'Collaboratore'}</Text>
                {mode !== 'ACTIVE_STAFF' && <Text style={[styles(finalColors).cardStatus, {color: iconColor}]}>In Attesa di Approvazione</Text>}
            </View>

            {/* Azioni (Approvazione/Rifiuto) in Colonna Verticale */}
            {(mode === 'PENDING_ACCESS' || mode === 'PENDING_ADMINS') ? (
                <View style={styles(finalColors).actionContainer}>
                    <TouchableOpacity
                        style={[styles(finalColors).actionButton, { backgroundColor: finalColors.accentGreen }]}
                        onPress={() => Alert.alert(
                            "Conferma Accettazione",
                            `Vuoi davvero accettare la richiesta di ${user.firstName || user.email} come ${user.role}?`,
                            [
                                { text: "Annulla", style: "cancel" },
                                { text: "Accetta", onPress: () => onApprove(user.id, user.role), style: "default" }
                            ]
                        )}
                    >
                        <Text style={styles(finalColors).actionButtonText}>Accetta</Text>
                    </TouchableOpacity>
                   
                    <TouchableOpacity
                        style={[styles(finalColors).actionButton, { backgroundColor: finalColors.accentRed }]}
                        onPress={() => Alert.alert(
                            "Conferma Rifiuto",
                            `Vuoi davvero rifiutare e cancellare l'account di ${user.firstName || user.email}?`,
                            [
                                { text: "Annulla", style: "cancel" },
                                { text: "Rifiuta", onPress: () => onDelete(user.id), style: "destructive" }
                            ]
                        )}
                    >
                        <Text style={styles(finalColors).actionButtonText}>Rifiuta</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles(finalColors).actionsRow}>
                    {primaryAction && mode === 'ACTIVE_STAFF' && (
                         <TouchableOpacity
                            onPress={() => onDelete(user)}
                            style={[styles(finalColors).actionBtn, { backgroundColor: finalColors.accentRed }]}
                        >
                            <Feather name="trash-2" size={18} color={finalColors.surface} />
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

// =====================================================================
// --- 2. SCHERMATA PRINCIPALE ---
// =====================================================================
export default function AdminStaffScreen({ route, navigation }) {
    // 1. Estrazione dati dai parametri di navigazione
    const { title, data, mode, handleAccept, handleReject } = route.params;

    // 2. Definizione dello Stato Locale (ECCOLO QUI, NEL POSTO GIUSTO!)
    const [localData, setLocalData] = useState(data);

    const ColorSchemes = {
        dark: { background: '#0D1117', surface: '#161B22', textPrimary: '#F0F6FC', accentCyan: '#00D1FF', accentRed: '#DA3633', accentPurple: '#A371F7', accentGreen: '#238636', divider: '#30363D', textFaded: '#8B949E' }
    };
    const Colors = ColorSchemes['dark'];

    // --- WRAPPER PER AGGIORNARE LA LISTA VISIVA ---
    const onAcceptWrapper = async (id, role) => {
        // Chiama il DB
        await handleAccept(id, role);
        // Aggiorna la vista rimuovendo l'elemento
        setLocalData(prevList => prevList.filter(item => item.id !== id));
    };

    const onRejectWrapper = async (id) => {
        // Chiama il DB
        await handleReject(id);
        // Aggiorna la vista rimuovendo l'elemento
        setLocalData(prevList => prevList.filter(item => item.id !== id));
    };

    // --- FUNZIONI LOCALI DI FALLBACK (Per Staff Attivo) ---
    const handleFireStaff = async (user) => {
        Alert.alert(
            "ATTENZIONE: Licenziamento",
            `Sei sicuro di voler rimuovere ${user.firstName || user.email} dal sistema? L'azione è irreversibile.`,
            [{ text: "Annulla", style: "cancel" }, {
                text: "RIMUOVI", style: "destructive", onPress: async () => {
                    try {
                        const userRef = doc(db, "users", user.id);
                        await deleteDoc(userRef);
                        setLocalData(prevList => prevList.filter(item => item.id !== user.id));
                        Alert.alert("Eseguito", "Utente rimosso dal database.");
                    } catch (error) { Alert.alert("Errore", "Impossibile rimuovere l'utente."); }
                }
            }]
        );
    };

    // --- MAPPATURA DELLE AZIONI ---
    const getActionProps = (item) => {
        if (mode === 'PENDING_ACCESS_ALL') {
            if (item.adminRequest === true) {
                return { onApprove: onAcceptWrapper, onReject: onRejectWrapper, mode: 'PENDING_ADMINS' };
            } else {
                return { onApprove: onAcceptWrapper, onDelete: onRejectWrapper, mode: 'PENDING_ACCESS' };
            }
        } else if (mode === 'ACTIVE_STAFF') {
            return { onDelete: handleFireStaff, mode: 'ACTIVE_STAFF' };
        }
        return {};
    };

    return (
        <SafeAreaView style={styles(Colors).safeArea}>
            <View style={styles(Colors).headerContainer}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles(Colors).backButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles(Colors).screenTitle}>{title}</Text>
            </View>

            <ScrollView contentContainerStyle={styles(Colors).scrollContent}>
                <Text style={styles(Colors).infoText}>Totale Elementi: {localData.length}</Text>
               
                {localData.length === 0 ? (
                    <Text style={styles(Colors).emptyState}>Nessun elemento da gestire in questa sezione.</Text>
                ) : (
                    localData.map(user => (
                        <StaffCard
                            key={user.id}
                            user={user}
                            Colors={Colors}
                            {...getActionProps(user)}
                        />
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// =====================================================================
// --- 3. STILI ---
// =====================================================================
const styles = (Colors) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.divider,
    },
    backButton: {
        marginRight: 15,
    },
    screenTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.textPrimary,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    infoText: {
        fontSize: 14,
        color: Colors.textFaded,
        marginBottom: 15,
    },
    emptyState: {
        marginTop: 50,
        textAlign: 'center',
        color: Colors.textFaded,
    },
    cardItem: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: Colors.divider,
    },
    roleIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    cardSubtitle: {
        fontSize: 13,
        color: Colors.textFaded,
        marginTop: 2,
    },
    cardStatus: {
        fontSize: 11,
        fontWeight: 'bold',
        marginTop: 5,
    },
    actionsRow: {
        flexDirection: 'row',
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionContainer: {
        flexDirection: 'column',   
        justifyContent: 'center',
        alignItems: 'flex-end',    
        marginTop: 0,
        paddingTop: 0,
        borderTopWidth: 0,
        width: 'auto',
    },
    actionButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        width: 90,                 
        alignItems: 'center',
        marginBottom: 5,           
    },
    actionButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
}); 