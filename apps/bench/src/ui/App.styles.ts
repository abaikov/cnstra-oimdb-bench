import React from 'react';

// Color constants
export const colors = {
    primary: '#667eea',
    primaryDark: '#764ba2',
    primaryLight: '#f0f4ff',
    secondary: '#607D8B',
    white: '#ffffff',
    black: '#000000',
    gray: {
        100: '#fafafa',
        200: '#f5f5f5',
        300: '#f0f0f0',
        400: '#e8eaf6',
        500: '#e0e0e0',
        600: '#ddd',
        700: '#999',
        800: '#666',
        900: '#333',
    },
    button: {
        blue: '#2196F3',
        orange: '#FF9800',
        purple: '#9C27B0',
        pink: '#E91E63',
        pinkDark: '#C2185B',
        cyan: '#00BCD4',
        cyanDark: '#0097A7',
        gray: '#6c757d',
        grayBlue: '#607D8B',
    },
    overlay: 'rgba(0, 0, 0, 0.7)',
    overlayWhite: 'rgba(255,255,255,0.2)',
    overlayWhiteHover: 'rgba(255,255,255,0.3)',
} as const;

// Shared style objects
const baseStyles = {
    transition: 'all 0.2s ease',
    borderRadius: {
        small: '6px',
        medium: '8px',
        large: '12px',
        xl: '16px',
        round: '20px',
    },
    shadow: {
        small: '0 1px 4px rgba(0,0,0,0.04)',
        medium: '0 2px 8px rgba(0,0,0,0.05)',
        large: '0 4px 16px rgba(0,0,0,0.1)',
        xl: '0 10px 40px rgba(0,0,0,0.15)',
        button: '0 2px 8px rgba(33, 150, 243, 0.3)',
        buttonOrange: '0 2px 8px rgba(255, 152, 0, 0.3)',
        buttonPurple: '0 2px 8px rgba(156, 39, 176, 0.3)',
        buttonPink: '0 3px 12px rgba(233, 30, 99, 0.4)',
        buttonCyan: '0 3px 12px rgba(0, 188, 212, 0.4)',
        buttonGray: '0 2px 8px rgba(96, 125, 139, 0.3)',
        buttonReset: '0 2px 8px rgba(108, 117, 125, 0.3)',
    },
} as const;

// Main App styles
export const appStyles = {
    container: {
        display: 'flex',
        minHeight: '100vh',
        height: '100vh',
        background: colors.white,
        borderRadius: baseStyles.borderRadius.xl,
        margin: '20px',
        boxShadow: baseStyles.shadow.xl,
        overflow: 'auto' as const,
        position: 'relative' as const,
    },
    overlay: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: colors.overlay,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column' as const,
        zIndex: 9999,
        borderRadius: baseStyles.borderRadius.xl,
    },
    overlayContent: {
        background: colors.white,
        padding: '40px 60px',
        borderRadius: baseStyles.borderRadius.xl,
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        textAlign: 'center' as const,
        minWidth: 300,
    },
    overlaySpinner: {
        fontSize: 48,
        marginBottom: 20,
        animation: 'spin 1s linear infinite',
    },
    overlayTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: colors.gray[900],
        marginBottom: 12,
    },
    overlayProgress: {
        fontSize: 16,
        color: colors.primary,
        fontWeight: 600,
        marginTop: 16,
        marginBottom: 8,
        padding: '12px 20px',
        background: colors.primaryLight,
        borderRadius: baseStyles.borderRadius.medium,
        border: `2px solid ${colors.primary}`,
    },
    overlayText: {
        fontSize: 14,
        color: colors.gray[800],
        lineHeight: 1.6,
    },
    resultsContainer: {
        minHeight: '100vh',
        overflow: 'auto' as const,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    resultsWrapper: {
        background: colors.white,
        margin: '20px',
        borderRadius: baseStyles.borderRadius.xl,
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
        overflow: 'hidden',
    },
    resultsHeader: {
        padding: '24px 32px',
        borderBottom: '2px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: colors.white,
    },
    resultsTitle: {
        margin: 0,
        fontSize: '28px',
        fontWeight: 700,
    },
    resultsSubtitle: {
        margin: '8px 0 0 0',
        opacity: 0.9,
        fontSize: '14px',
    },
    backButton: {
        padding: '12px 24px',
        backgroundColor: colors.overlayWhite,
        color: colors.white,
        border: `2px solid rgba(255,255,255,0.3)`,
        borderRadius: baseStyles.borderRadius.medium,
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '14px',
        backdropFilter: 'blur(10px)',
        transition: baseStyles.transition,
    },
};

// DeckList styles
export const deckListStyles = {
    container: {
        height: '100%',
        overflow: 'auto' as const,
        padding: '24px',
        background: colors.gray[100],
    },
};

// DeckItem styles
export const deckItemStyles = {
    container: {
        padding: 20,
        marginBottom: 20,
        background: colors.white,
        borderRadius: baseStyles.borderRadius.large,
        border: `1px solid ${colors.gray[500]}`,
        boxShadow: baseStyles.shadow.medium,
        boxSizing: 'border-box' as const,
        transition: baseStyles.transition,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 18,
        color: colors.gray[900],
        fontWeight: 600,
    },
    badge: {
        fontSize: 13,
        color: colors.primary,
        fontWeight: 600,
        background: colors.primaryLight,
        padding: '4px 12px',
        borderRadius: baseStyles.borderRadius.round,
    },
    loading: {
        padding: 20,
        marginBottom: 16,
        background: colors.white,
        borderRadius: baseStyles.borderRadius.large,
        border: `1px solid ${colors.gray[500]}`,
        boxShadow: baseStyles.shadow.medium,
    },
    loadingText: {
        color: colors.gray[700],
        fontSize: '14px',
    },
};

// CardItem styles
export const cardItemStyles = {
    container: {
        border: `1px solid ${colors.gray[500]}`,
        borderRadius: '10px',
        padding: 16,
        backgroundColor: colors.white,
        boxShadow: baseStyles.shadow.small,
        transition: baseStyles.transition,
    },
    title: {
        fontWeight: 600,
        fontSize: 15,
        marginBottom: 8,
        color: colors.gray[900],
    },
    description: {
        color: colors.gray[800],
        fontSize: 13,
        marginBottom: 12,
        lineHeight: 1.5,
    },
    commentsHeader: {
        borderTop: `2px solid ${colors.gray[200]}`,
        paddingTop: 12,
    },
    commentsTitle: {
        fontWeight: 600,
        fontSize: 12,
        marginBottom: 10,
        color: colors.primary,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
    },
};

// CommentItem styles
export const commentItemStyles = {
    container: {
        padding: 12,
        backgroundColor: colors.white,
        border: `1px solid ${colors.gray[400]}`,
        borderRadius: baseStyles.borderRadius.medium,
        fontSize: 13,
        boxShadow: baseStyles.shadow.small,
        transition: baseStyles.transition,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    author: {
        fontWeight: 600,
        color: colors.primary,
        fontSize: 13,
    },
    editButton: {
        fontSize: 11,
        padding: '4px 10px',
        border: `1px solid ${colors.gray[600]}`,
        borderRadius: baseStyles.borderRadius.small,
        backgroundColor: '#f8f9fa',
        cursor: 'pointer',
        fontWeight: 500,
        transition: baseStyles.transition,
    },
    textarea: {
        width: '100%',
        minHeight: 80,
        padding: '10px',
        fontSize: 13,
        border: `2px solid ${colors.primary}`,
        borderRadius: baseStyles.borderRadius.medium,
        resize: 'vertical' as const,
        fontFamily: 'inherit',
        outline: 'none',
        transition: baseStyles.transition,
    },
    buttonGroup: {
        marginTop: 10,
        display: 'flex',
        gap: 8,
    },
    saveButton: {
        fontSize: 12,
        padding: '8px 16px',
        border: 'none',
        borderRadius: baseStyles.borderRadius.small,
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        color: colors.white,
        cursor: 'pointer',
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
    },
    cancelButton: {
        fontSize: 12,
        padding: '8px 16px',
        border: `1px solid ${colors.gray[600]}`,
        borderRadius: baseStyles.borderRadius.small,
        backgroundColor: '#f8f9fa',
        cursor: 'pointer',
        fontWeight: 500,
        color: colors.gray[800],
    },
    text: {
        color: '#555',
        lineHeight: 1.6,
        fontSize: 13,
    },
};

// Toolbar styles
export const toolbarStyles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 24px',
        borderBottom: '2px solid #f0f0f0',
        flexWrap: 'wrap' as const,
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    },
    selectorGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingRight: 16,
        borderRight: '2px solid rgba(0,0,0,0.1)',
    },
    selectorLabel: {
        fontWeight: 600,
        color: colors.gray[900],
        fontSize: '14px',
    },
    select: {
        padding: '8px 12px',
        borderRadius: baseStyles.borderRadius.medium,
        border: `2px solid ${colors.gray[600]}`,
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        background: colors.white,
        minWidth: 180,
    },
    buttonsGroup: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap' as const,
        flex: 1,
        justifyContent: 'flex-end',
    },
    button: (color: string, disabled: boolean) => ({
        backgroundColor: color,
        color: colors.white,
        border: 'none',
        padding: '10px 18px',
        borderRadius: baseStyles.borderRadius.medium,
        fontSize: '13px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
    }),
    buttonLarge: (color: string, disabled: boolean, gradient?: string) => ({
        backgroundColor: color,
        color: colors.white,
        border: 'none',
        padding: '10px 20px',
        borderRadius: baseStyles.borderRadius.medium,
        fontSize: '13px',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: disabled ? color : gradient || color,
    }),
    buttonBlue: {
        boxShadow: baseStyles.shadow.button,
    },
    buttonOrange: {
        boxShadow: baseStyles.shadow.buttonOrange,
    },
    buttonPurple: {
        boxShadow: baseStyles.shadow.buttonPurple,
    },
    buttonPink: {
        boxShadow: baseStyles.shadow.buttonPink,
    },
    buttonCyan: {
        boxShadow: baseStyles.shadow.buttonCyan,
    },
    buttonGray: {
        boxShadow: baseStyles.shadow.buttonGray,
    },
    buttonReset: {
        boxShadow: baseStyles.shadow.buttonReset,
    },
};

// SidePanel styles
export const sidePanelStyles = {
    container: {
        width: 340,
        borderLeft: `2px solid ${colors.gray[300]}`,
        padding: '24px',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)',
    },
    title: {
        fontWeight: 700,
        fontSize: '18px',
        marginBottom: 12,
        color: colors.gray[900],
        borderBottom: `2px solid ${colors.primary}`,
        paddingBottom: 8,
    },
    deckName: {
        marginBottom: 24,
        fontSize: '16px',
        color: colors.primary,
        fontWeight: 500,
        padding: '12px',
        background: colors.primaryLight,
        borderRadius: baseStyles.borderRadius.medium,
    },
    deckNameEmpty: {
        marginBottom: 24,
        fontSize: '16px',
        color: colors.gray[700],
        fontWeight: 500,
        padding: '12px',
        background: colors.gray[200],
        borderRadius: baseStyles.borderRadius.medium,
    },
    label: {
        fontSize: 13,
        color: colors.gray[800],
        marginBottom: 8,
        fontWeight: 500,
    },
    input: {
        width: '100%',
        padding: '12px 16px',
        border: `2px solid ${colors.gray[500]}`,
        borderRadius: baseStyles.borderRadius.medium,
        fontSize: '14px',
        transition: baseStyles.transition,
        background: colors.white,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: colors.primary,
        marginBottom: 12,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
    },
    tag: {
        display: 'inline-block',
        padding: '4px 10px',
        marginRight: 6,
        marginBottom: 6,
        background: colors.primaryLight,
        color: colors.primary,
        borderRadius: baseStyles.borderRadius.small,
        fontSize: 12,
        fontWeight: 500,
    },
    userList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
    userItem: {
        padding: 8,
        background: colors.gray[100],
        borderRadius: baseStyles.borderRadius.small,
        fontSize: 13,
        color: colors.gray[900],
    },
};

// HeatmapOverlay styles
export const heatmapOverlayStyles = {
    container: {
        position: 'fixed' as const,
        right: 20,
        bottom: 20,
        background: 'rgba(255,255,255,0.95)',
        color: colors.gray[900],
        padding: 20,
        borderRadius: baseStyles.borderRadius.large,
        fontSize: 13,
        minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: '1px solid rgba(102, 126, 234, 0.2)',
        backdropFilter: 'blur(10px)',
    },
    title: {
        fontWeight: 700,
        marginBottom: 12,
        borderBottom: `2px solid ${colors.primary}`,
        paddingBottom: 8,
        fontSize: 15,
        color: colors.gray[900],
    },
    description: {
        marginBottom: 12,
        fontSize: 12,
        color: colors.gray[800],
        lineHeight: 1.5,
    },
    totalBox: {
        marginBottom: 12,
        padding: '10px',
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        borderRadius: baseStyles.borderRadius.medium,
        color: colors.white,
    },
    totalText: {
        fontSize: 18,
    },
    list: {
        maxHeight: 200,
        overflowY: 'auto' as const,
    },
    listItem: (count: number) => ({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        padding: '6px 10px',
        background: count > 20 ? '#ffebee' : count > 10 ? '#fff3e0' : '#e3f2fd',
        borderRadius: baseStyles.borderRadius.small,
    }),
    listItemKey: {
        fontSize: 12,
        fontWeight: 500,
    },
    listItemValue: (count: number) => ({
        fontWeight: 'bold' as const,
        color: count > 20 ? '#c62828' : count > 10 ? '#f57c00' : '#1976d2',
        fontSize: 13,
        padding: '2px 8px',
        background: colors.white,
        borderRadius: '12px',
        minWidth: 40,
        textAlign: 'center' as const,
    }),
    legend: {
        fontSize: 11,
        color: '#888',
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid #eee',
        lineHeight: 1.6,
    },
    legendRed: {
        color: '#c62828',
    },
    legendOrange: {
        color: '#f57c00',
    },
    legendBlue: {
        color: '#1976d2',
    },
};

// CardsList styles
export const cardsListStyles = {
    container: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 12,
    },
};

// CommentsList styles
export const commentsListStyles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
};

// DeckRow styles
export const deckRowStyles = {
    container: (baseStyle: React.CSSProperties) => ({
        ...baseStyle,
        display: 'flex',
        flexDirection: 'column' as const,
        padding: 8,
        borderBottom: '1px solid #eee',
    }),
    header: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    cardsContainer: {
        display: 'flex',
        gap: 8,
    },
};

// CardPreview styles
export const cardPreviewStyles = {
    container: {
        flex: '0 0 300px',
        border: '1px solid #ddd',
        borderRadius: 6,
        padding: 8,
    },
    description: {
        color: '#555',
        fontSize: 12,
    },
    commentsContainer: {
        marginTop: 6,
    },
    comment: {
        fontSize: 12,
    },
};

// App layout styles
export const appLayoutStyles = {
    mainContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        minHeight: 0, // Allow flex child to shrink below content size
    },
    contentArea: {
        flex: 1,
        position: 'relative' as const,
        overflow: 'auto' as const,
        background: colors.gray[100],
        minHeight: 0, // Allow flex child to shrink below content size
    },
};

// Hover handlers
export const hoverHandlers = {
    deckItem: {
        onEnter: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = baseStyles.shadow.large;
            e.currentTarget.style.transform = 'translateY(-2px)';
        },
        onLeave: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = baseStyles.shadow.medium;
            e.currentTarget.style.transform = 'translateY(0)';
        },
    },
    cardItem: {
        onEnter: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            e.currentTarget.style.borderColor = colors.primary;
        },
        onLeave: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = baseStyles.shadow.small;
            e.currentTarget.style.borderColor = colors.gray[500];
        },
    },
    commentItem: {
        onEnter: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = baseStyles.shadow.medium;
            e.currentTarget.style.borderColor = colors.primary;
        },
        onLeave: (e: React.MouseEvent<HTMLDivElement>) => {
            e.currentTarget.style.boxShadow = baseStyles.shadow.small;
            e.currentTarget.style.borderColor = colors.gray[400];
        },
    },
    editButton: {
        onEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = colors.primary;
            e.currentTarget.style.color = colors.white;
            e.currentTarget.style.borderColor = colors.primary;
        },
        onLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
            e.currentTarget.style.color = colors.gray[900];
            e.currentTarget.style.borderColor = colors.gray[600];
        },
    },
    backButton: {
        onEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = colors.overlayWhiteHover;
            e.currentTarget.style.transform = 'translateY(-2px)';
        },
        onLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = colors.overlayWhite;
            e.currentTarget.style.transform = 'translateY(0)';
        },
    },
};
