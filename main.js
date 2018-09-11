'use strict';
const Path = require('fire-path');
const Fs = require('fire-fs');
const Globby = require('globby');
const {android, ios} = Editor.require('app://editor/core/native-packer');
/**
 * 添加 facebook audience network 的 sdk 到 android 工程
 * @param options
 * @returns {Promise}
 */
async function _handleAndroid(options) {
    Editor.log('Android Instant--> adding Android Instant support');

    _genFirstPackage(options);

    //修改build.gradle文件
    let config = options['android-instant'];
    let androidPacker = new android(options);

    //拷贝脚本文件
    let srcJsPath = Editor.url('packages://google-play-instant/libs/js');
    let destJsPath = Path.join(options.dest, 'src');
    Fs.copySync(srcJsPath, destJsPath);

    //读取android-instant-downloader.js 然后添加 INSTANT_REMOTE_SERVER 字段
    let dlPath = Path.join(destJsPath, 'android-instant-downloader.js');
    let dl = Fs.readFileSync(dlPath, 'utf-8');
    dl = dl.replace(/INSTANT_REMOTE_SERVER\s=\s''/g, `INSTANT_REMOTE_SERVER = '${config.REMOTE_SERVER_ROOT}'`);
    Fs.writeFileSync(dlPath, dl);

    //在main.js中添加引用
    androidPacker.addRequireToMainJs("src/android-instant-downloader.js");
    androidPacker.addRequireToMainJs("src/android-instant-helper.js");

    //添加3个字段到strings.xml
    let stringList = [
        {name: 'host', data: config.host},
        {name: 'path_pattern', data: config.pathPattern},
        {name: 'scheme', data: config.scheme},
    ];

    let xmlPath = Path.join(options.dest, 'frameworks/runtime-src/proj.android-studio/game/res/values/strings.xml');
    for (let i = 0; i < stringList.length; i++) {
        let item = stringList[i];
        await androidPacker.addStringToXML({
            "$": {
                name: item.name,
                translatable: "false"
            },
            "_": item.data
        }, xmlPath);
    }

    _startPreviewServer(options);
}

/**
 * 生成首包的资源
 * @private
 */
function _genFirstPackage(options) {

    //先拷贝第一个包，剩余的资源放入别的文件夹后续备用
    let srcDirPath = Path.join(options.dest, "res");

    let remoteDirPath = Path.join(options.dest, "remote_res");
    Fs.ensureDirSync(remoteDirPath);
    Fs.emptyDirSync(remoteDirPath);

    if (options['android-instant'].skipRecord) {
        Fs.copySync(srcDirPath, remoteDirPath);
        return
    }

    Editor.log("moving first package files");
    let pkgInfo = Fs.readFileSync(Path.join(options['android-instant'].recordPath, "packageInfo.json"), 'utf-8');
    if (!pkgInfo) return;
    pkgInfo = JSON.parse(pkgInfo);

    //selectCount 有可能因为手动拖拽资源进来而导致比totalCount多
    if (pkgInfo.totalCount <= pkgInfo.selectCount) {
        Fs.copySync(srcDirPath, remoteDirPath);
        return;
    }

    let destDirPath = Path.join(options.dest, "temp_res");
    Fs.ensureDirSync(destDirPath);
    Fs.emptyDirSync(destDirPath);

    let paths = Globby.sync(Path.join(srcDirPath, "**"), {nodir: true});
    let first_package_list = pkgInfo.first.items.concat(options.scenes);

    paths.forEach(path => {
        let id = Path.basenameNoExt(path);
        first_package_list.forEach(uuid => {
            if (id.indexOf(uuid) != -1) {
                let destPath = path.replace("res/", "temp_res/");
                Fs.ensureDirSync(Path.dirname(destPath));
                Fs.copySync(path, destPath);
            }
        });
    });

    Fs.renameSync(srcDirPath, Path.join(options.dest, "remote_res"));
    Fs.renameSync(destDirPath, srcDirPath);
}

/**
 * 启动测试服务器
 * @param options
 * @private
 */
function _startPreviewServer(options) {
    Editor.Ipc.sendToMain('app:update-android-instant-preview-path', Path.join(options.dest, "remote_res"));
}

async function handleEvent(options, cb) {
    if (options.actualPlatform.toLowerCase() === 'android-instant') {
        await _handleAndroid(options).catch((e) => {
            Editor.log("Some error have occurred while adding Android Instant Android SDK ", e);
        });
    }
    cb && cb();
}

module.exports = {
    load() {
        Editor.Builder.on('before-change-files', handleEvent);
    },

    unload() {
        Editor.Builder.removeListener('before-change-files', handleEvent);
    },

    messages: {}
};
