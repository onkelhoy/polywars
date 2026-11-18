import '@polywar/gun-menu';

const menu = document.querySelector('pw-gun-menu');
menu.items = [
    { id: 'kar98k', name: 'Kar98k', kind: 'rifle' },
    { id: 'mp40', name: 'MP40', kind: 'smg' },
    { id: 'm1911', name: 'M1911', kind: 'pistol' },
    { id: 'ithaca-m37', name: 'Ithaca 37', kind: 'shotgun' },
];
menu.current = 0;
menu.addEventListener('pick', e => { menu.current = e.detail.index; console.log('pick', e.detail.item.id); });
