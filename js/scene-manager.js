class SceneManager
{
    constructor()
    {
        this.screens = {
            title: document.getElementById('screen-title'),
            howto: document.getElementById('screen-howto'),
            weapon: document.getElementById('screen-weapon'),
            pause: document.getElementById('screen-pause'),
            result: document.getElementById('screen-result')
        };
        this.hud = document.getElementById('hud');
    }

    changeScene(sceneName)
    {
        // すべての画面を一度非表示にする
        Object.values(this.screens).forEach(screen => screen.classList.remove('active'));

        // HUDの表示切り替え（メインゲーム中、またはポーズ中のみON）
        if (sceneName === 'game' || sceneName === 'pause')
        {
            this.hud.classList.add('active');
        } else
        {
            this.hud.classList.remove('active');
        }

        // 指定画面をアクティブに（'game'の場合はUIレイヤーを全て閉じる）
        if (this.screens[sceneName])
        {
            this.screens[sceneName].classList.add('active');
        }
    }
}