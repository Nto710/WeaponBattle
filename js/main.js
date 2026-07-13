document.addEventListener("DOMContentLoaded", () =>
{
    const core = new GameCore();
    const ui = new SceneManager();
    let selectedWeapon = 'sword';
    let previousSceneBeforeHowto = 'title'; // 操作方法から戻る場所の記憶用

    // 毎フレームのループ処理を実行
    function tick()
    {
        core.update();
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // コールバック：ゲームオーバー時にリザルトへ遷移
    core.onGameOverCallback = (finalScore) =>
    {
        document.getElementById('result-title').innerText = "GAME OVER";
        document.getElementById('result-score').innerText = `撃破数: ${finalScore}`;
        ui.changeScene('result');
    };

    // --- ボタンイベント登録 ---

    // タイトル画面
    document.getElementById('btn-start').addEventListener('click', () => ui.changeScene('weapon'));
    document.getElementById('btn-how-to').addEventListener('click', () =>
    {
        previousSceneBeforeHowto = 'title';
        ui.changeScene('howto');
    });
    document.getElementById('btn-exit').addEventListener('click', () =>
    {
        if (confirm("ゲームを終了してウィンドウを閉じますか？"))
        {
            window.close(); // ブラウザ仕様により閉じない場合は警告/ダイアログ
            alert("ブラウザのセキュリティ制限により自動でタブを閉じられません。手動でタブを閉じてください。");
        }
    });

    // 操作方法画面からの戻り
    document.getElementById('btn-howto-back').addEventListener('click', () =>
    {
        ui.changeScene(previousSceneBeforeHowto);
    });

    // 武器選択画面
    const selectWeaponAndStart = (type) =>
    {
        selectedWeapon = type;
        ui.changeScene('game');
        core.start(selectedWeapon);
    };
    document.getElementById('btn-wp-sword').addEventListener('click', () => selectWeaponAndStart('sword'));
    document.getElementById('btn-wp-axe').addEventListener('click', () => selectWeaponAndStart('axe'));
    document.getElementById('btn-wp-magic').addEventListener('click', () => selectWeaponAndStart('magic'));
    document.getElementById('btn-wp-back').addEventListener('click', () => ui.changeScene('title'));

    // ポーズメニュー
    document.getElementById('btn-resume').addEventListener('click', () =>
    {
        core.setPause(false);
        ui.changeScene('game');
    });
    document.getElementById('btn-pause-howto').addEventListener('click', () =>
    {
        previousSceneBeforeHowto = 'pause';
        ui.changeScene('howto');
    });
    document.getElementById('btn-to-title').addEventListener('click', () =>
    {
        core.clearScene();
        ui.changeScene('title');
    });

    // リザルト画面
    document.getElementById('btn-retry').addEventListener('click', () =>
    {
        ui.changeScene('game');
        core.start(selectedWeapon);
    });
    document.getElementById('btn-result-title').addEventListener('click', () =>
    {
        core.clearScene();
        ui.changeScene('title');
    });

    // --- キーボードによるグローバルな一時停止 (Esc) 処理 ---
    window.addEventListener('keydown', (e) =>
    {
        if (e.key === 'Escape' || e.key === 'Esc')
        {
            if (core.isPlaying)
            {
                if (!core.isPaused)
                {
                    // ポーズ
                    core.setPause(true);
                    ui.changeScene('pause');
                } else if (core.isPaused && previousSceneBeforeHowto !== 'howto')
                {
                    // ポーズ解除（操作方法画面を開いていない場合のみ）
                    core.setPause(false);
                    ui.changeScene('game');
                }
            }
        }
    });
});