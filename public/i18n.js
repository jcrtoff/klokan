(function () {
  const TRANSLATIONS = {
    fr: {
      // shared
      logout:               'Déconnexion',
      send:                 'Envoyer',
      loading:              'Chargement…',
      load_error:           'Erreur de chargement.',
      connection_error:     'Erreur de connexion.',
      add_btn:              'Ajouter',
      revoke:               'Révoquer',
      revoked:              'Révoqué',
      // broker.html
      sessions:             'Sessions',
      my_team:              'Mon équipe',
      clients_tab:          'Clients',
      team:                 'Équipe',
      no_active_session:    'Aucune session active',
      add_broker:           'Ajouter un courtier',
      email_placeholder:    'courriel@example.com',
      name_placeholder:     'Prénom Nom',
      connected:            'Connecté',
      disconnected:         'Déconnecté',
      tokens:               'Tokens',
      cost:                 'Coût',
      avg_time:             'Temps moy.',
      select_session:       'Sélectionnez une session à gauche',
      ai_in_conversation:   'IA en conversation',
      broker_took_over:     'Vous avez pris le relais',
      claim_btn:            'Prendre en charge',
      intervenir_btn:       'Intervenir',
      yield_btn:            "Rendre le contrôle à l'IA",
      write_to_client:      'Écrire au client…',
      unknown_client:       'Client inconnu',
      no_notes:             'Aucune note pour le moment.',
      qualification:        'Qualification',
      project:              'Projet',
      budget:               'Budget',
      sector:               'Secteur',
      type:                 'Type',
      timeline:             'Délai',
      pre_approval:         'Pré-approbation',
      ai_notes:             'Notes IA',
      new_client:           'Nouveau client',
      no_team_brokers:      'Aucun courtier dans votre équipe.',
      revoke_confirm:       "Révoquer l'accès de ce courtier ?",
      broker_badge:         'Courtier',
      unassigned_badge:     'Non assigné',
      tab_sessions:         'Sessions',
      tab_chat:             'Chat',
      tab_lead:             'Profil',
      // admin.html
      managers:             'Gestionnaires',
      add_manager:          'Ajouter un gestionnaire',
      name_label:           'Nom',
      email_label:          'Courriel',
      status:               'Statut',
      last_login:           'Dernière connexion',
      active:               'Actif',
      no_managers:          'Aucun gestionnaire.',
      revoke_manager_confirm: "Révoquer l'accès de ce gestionnaire ?",
      revoke_error:         'Erreur lors de la révocation.',
      email_invalid:        'Courriel invalide.',
      name_required:        'Nom requis.',
      email_already_registered: 'Ce courriel est déjà enregistré.',
      internal_error:       'Erreur interne.',
      not_found:            'Introuvable.',
      mgr_email_placeholder: 'gestionnaire@example.com',
      mgr_name_placeholder:  'Prénom Nom',
      // broker.html – burger menu
      settings:             'Paramètres',
      settings_lang:        'Langue',
      menu_limits:          'Limites',
      menu_share:           'Partager & Intégrer',
      // broker.html – embed modal
      embed_link_label:     'Lien direct',
      embed_copy_link:      'Copier le lien',
      embed_snippet_label:  'Widget à intégrer (JS)',
      embed_copy_snippet:   'Copier le snippet',
      copied:               '✓ Copié !',
      // broker.html – assign
      assign_btn:           'Assigner',
      broker_select_placeholder: '— Choisir un courtier —',
      // broker.html – abuse limits
      limits_title:         'Limites de la conversation',
      limits_rate:          'Débit',
      limits_length:        'Longueur',
      limits_cost:          'Coût max',
      // login.html
      login_subtitle:       'Connexion courtier',
      email_input_placeholder: 'votre@courriel.com',
      send_code:            'Envoyer le code',
      code_sent_prefix:     'Un code à 6 chiffres a été envoyé à',
      verify_code_label:    'Code de vérification',
      verify_btn:           'Vérifier',
      change_email:         'Changer de courriel',
      loading_msg:          'Chargement…',
      invalid_email_error:  'Veuillez entrer un courriel valide.',
      invalid_code_error:   'Veuillez entrer le code à 6 chiffres.',
      // clients.html
      back_to_dashboard:    '← Tableau de bord',
      clients_title:        'Clients',
      clients_link:         'Clients →',
      search_placeholder:   'Rechercher par nom ou courriel…',
      filter_all:           'Tous les scores',
      score_chaud:          'Chaud',
      score_tiede:          'Tiède',
      score_froid:          'Froid',
      col_name:             'Nom',
      col_score:            'Score',
      col_budget:           'Budget',
      col_neighbourhood:    'Quartier',
      col_project:          'Type de projet',
      col_last_activity:    'Dernière activité',
      col_msgs:             'Msgs',
      no_clients:           'Aucun client trouvé.',
      // chat.html
      subtitle:                  'Assistante · Klokan',
      subtitle_with_broker_prefix: 'Assistante de',
      write_message:        'Écrire un message…',
      connecting:           'Connexion en cours…',
      reconnecting:         'Reconnexion…',
      max_retry:            'Impossible de se connecter. Veuillez rafraîchir la page.',
      broker_typing:        "Le courtier est en train d'écrire…",
      is_typing:            "est en train d'écrire…",
    },
    en: {
      // shared
      logout:               'Sign Out',
      send:                 'Send',
      loading:              'Loading…',
      load_error:           'Load error.',
      connection_error:     'Connection error.',
      add_btn:              'Add',
      revoke:               'Revoke',
      revoked:              'Revoked',
      // broker.html
      sessions:             'Sessions',
      my_team:              'My Team',
      clients_tab:          'Clients',
      team:                 'Team',
      no_active_session:    'No active sessions',
      add_broker:           'Add a broker',
      email_placeholder:    'email@example.com',
      name_placeholder:     'First Last',
      connected:            'Connected',
      disconnected:         'Disconnected',
      tokens:               'Tokens',
      cost:                 'Cost',
      avg_time:             'Avg. time',
      select_session:       'Select a session on the left',
      ai_in_conversation:   'AI in conversation',
      broker_took_over:     'You have taken over',
      claim_btn:            'Claim',
      intervenir_btn:       'Take over',
      yield_btn:            'Yield to AI',
      write_to_client:      'Write to client…',
      unknown_client:       'Unknown client',
      no_notes:             'No notes yet.',
      qualification:        'Qualification',
      project:              'Project',
      budget:               'Budget',
      sector:               'Area',
      type:                 'Type',
      timeline:             'Timeline',
      pre_approval:         'Pre-approval',
      ai_notes:             'AI Notes',
      new_client:           'New client',
      no_team_brokers:      'No brokers in your team.',
      revoke_confirm:       "Revoke this broker's access?",
      broker_badge:         'Broker',
      unassigned_badge:     'Unassigned',
      tab_sessions:         'Sessions',
      tab_chat:             'Chat',
      tab_lead:             'Profile',
      // broker.html – burger menu
      settings:             'Settings',
      settings_lang:        'Language',
      menu_limits:          'Limits',
      menu_share:           'Share & Embed',
      // broker.html – embed modal
      embed_link_label:     'Direct link',
      embed_copy_link:      'Copy link',
      embed_snippet_label:  'Embed widget (JS)',
      embed_copy_snippet:   'Copy snippet',
      copied:               '✓ Copied!',
      // broker.html – assign
      assign_btn:           'Assign',
      broker_select_placeholder: '— Select a broker —',
      // broker.html – abuse limits
      limits_title:         'Conversation limits',
      limits_rate:          'Rate',
      limits_length:        'Length',
      limits_cost:          'Max cost',
      // admin.html
      managers:             'Managers',
      add_manager:          'Add a manager',
      name_label:           'Name',
      email_label:          'Email',
      status:               'Status',
      last_login:           'Last login',
      active:               'Active',
      no_managers:          'No managers.',
      revoke_manager_confirm: "Revoke this manager's access?",
      revoke_error:         'Error revoking access.',
      email_invalid:        'Invalid email.',
      name_required:        'Name is required.',
      email_already_registered: 'This email is already registered.',
      internal_error:       'Internal error.',
      not_found:            'Not found.',
      mgr_email_placeholder: 'manager@example.com',
      mgr_name_placeholder:  'First Last',
      // login.html
      login_subtitle:       'Broker login',
      email_input_placeholder: 'your@email.com',
      send_code:            'Send code',
      code_sent_prefix:     'A 6-digit code was sent to',
      verify_code_label:    'Verification code',
      verify_btn:           'Verify',
      change_email:         'Change email',
      loading_msg:          'Loading…',
      invalid_email_error:  'Please enter a valid email.',
      invalid_code_error:   'Please enter the 6-digit code.',
      // clients.html
      back_to_dashboard:    '← Dashboard',
      clients_title:        'Clients',
      clients_link:         'Clients →',
      search_placeholder:   'Search by name or email…',
      filter_all:           'All scores',
      score_chaud:          'Hot',
      score_tiede:          'Warm',
      score_froid:          'Cold',
      col_name:             'Name',
      col_score:            'Score',
      col_budget:           'Budget',
      col_neighbourhood:    'Area',
      col_project:          'Project type',
      col_last_activity:    'Last activity',
      col_msgs:             'Msgs',
      no_clients:           'No clients found.',
      // chat.html
      subtitle:                  'Assistant · Klokan',
      subtitle_with_broker_prefix: 'Assistant of',
      write_message:        'Write a message…',
      connecting:           'Connecting…',
      reconnecting:         'Reconnecting…',
      max_retry:            'Could not connect. Please refresh the page.',
      broker_typing:        'The broker is typing…',
      is_typing:            'is typing…',
    }
  };

  const STORAGE_KEY = 'klokan_language';
  const SUPPORTED   = ['fr', 'en'];
  const DEFAULT     = 'fr';

  let _lang = DEFAULT;

  function getLang() {
    return _lang;
  }

  function t(key) {
    return (TRANSLATIONS[_lang] && TRANSLATIONS[_lang][key]) || (TRANSLATIONS[DEFAULT] && TRANSLATIONS[DEFAULT][key]) || key;
  }

  function apply(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT;
    _lang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (el.dataset.i18nTarget === 'placeholder') {
        el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    });

    const toggleEl = document.getElementById('langToggle');
    if (toggleEl) {
      toggleEl.querySelectorAll('[data-lang]').forEach(btn => {
        btn.classList.toggle('lang-active', btn.dataset.lang === lang);
      });
    }
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT;
    _lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    apply(lang);
  }

  function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    _lang = SUPPORTED.includes(stored) ? stored : DEFAULT;
    apply(_lang);
  }

  window.i18n = { getLang, t, apply, setLang, init };
})();
