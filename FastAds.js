// ==UserScript==
// @name         Fast Ads
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// ==/UserScript==

// Misc Parameters
let maxRateFound = null;
let playerElem = null;
let videoElem = null;
let intervalID = null;
let isHidden = false;
let opacityVal = '0.25';

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;

// Locations for observers
let vidLoc = null;
let adLoc = null;

function trySkipAd() {
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton && !skipButton.disabled) {
        skipButton.click();
        console.log('[Fast Ads] HUGE ad skip');
    }
}

function adPlaying() {
    if (isHidden === false || playerElem.style.opacity === '1') {
        playerElem.style.opacity = opacityVal;
        videoElem.style.opacity = opacityVal;
        console.log('[Fast Ads] Get blocked, kid');
        isHidden = true;
    }
}

function vidPlaying() {
    if (isHidden === true || playerElem.style.opacity !== '1') {
        playerElem.style.opacity = '1';
        videoElem.style.opacity = '1';
        isHidden = false;
    }
}

function closeInterval() {
    if (intervalID) {
        clearInterval(intervalID); // Stop clicking the skip ad button
        intervalID = null;
    }
}

function getMaxRate() {
    let rate = 16;
    const decrement = 1;
    while (rate > 1) {
        try {
            videoElem.playbackRate = rate;
            maxRateFound = rate;
            break;
        } catch (error) {
            // Error when setting unsupported playback rate, just continue with the loop
        }
        rate -= decrement;
    }
    if (!maxRateFound) { maxRateFound = 1; }
}

function speedUpAds() {
    if (playerElem.classList.contains('ad-interrupting')) {
        if (!maxRateFound) { getMaxRate(); }
        if (!intervalID) { intervalID = setInterval(trySkipAd, 100); }
        adPlaying();
        videoElem.playbackRate = maxRateFound;
        videoElem.muted = true;
        //playerElem.mute();
    } else {
        closeInterval();
        vidPlaying();
        videoElem.playbackRate = 1;
        videoElem.muted = false; // Unmute the video
        //playerElem.unMute();
    }
}

function waitForVidLoc(callback) {
    vidLoc = document.body; // Needs to be the body because sometimes the ads load/play before the structure has settled
    if (vidLoc) {
        callback();
    } else {
        setTimeout(() => waitForVidLoc(callback), 10);
    }
}

function waitForAdLoc(callback) {
    adLoc = document.querySelector('#page-manager');
    if (adLoc) {
        callback();
    } else {
        setTimeout(() => waitForAdLoc(callback), 10);
    }
}

function observePlayerChanges() {
    speedUpAds();
    playerChangesObserver = new MutationObserver(function(mutations) {
        speedUpAds();
    });

    // Start observing
    playerChangesObserver.observe(playerElem, {
        attributes: true,
        attributeFilter: ['class'] // Only look for changes in the class attribute
    });
}

function waitForPlayerAndObserve() {
    playerElem = document.querySelector('.html5-video-player');
    videoElem = document.querySelector('video');
    if (playerElem && videoElem) {
        observePlayerChanges();
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            videoElem = videoElem || document.querySelector('video');
            if (playerElem && videoElem) {
                observePlayerChanges();
                playerObserver.disconnect();
            }
        });
        playerObserver.observe(vidLoc, {
            childList: true,
            subtree: true
        });
    }
}

const adSelectors = ['#fulfilled-layout',
                     '#player-ads',
                     '#masthead-ad',
                     '#below > ytd-merch-shelf-renderer',
                     '#movie_player > div.ytp-paid-content-overlay',
                     'body > ytd-app > ytd-popup-container > tp-yt-paper-dialog']

const selectorString = adSelectors.join(', ');
function removeAds() {
    const elementsToRemove = document.querySelectorAll(selectorString);
    elementsToRemove.forEach(el => el.remove());
}

function waitForAdsAndObserve() {
    adObserver = new MutationObserver(function(mutations) {
        removeAds();
    });

    // Initial check
    removeAds();

    adObserver.observe(adLoc, {
        childList: true,
        subtree: true
    });
}

function mainFunction() {
    'use strict';
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
        //console.log('[Fast Ads] Reset playerChangesObserver');
    }
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
        //console.log('[Fast Ads] Reset playerObserver');
    }
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
        //console.log('[Fast Ads] Reset adObserver');
    }

    waitForVidLoc(waitForPlayerAndObserve);
    waitForAdLoc(waitForAdsAndObserve);
}

// Run script logic immediately for initial page load
mainFunction();

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;

// Polling logic to detect URL changes
function checkForURLChange() {
    if (lastPathStr !== location.pathname || lastQueryStr !== location.search || lastHashStr !== location.hash) {
        lastPathStr = location.pathname;
        lastQueryStr = location.search;
        lastHashStr = location.hash;
        //console.log('[Fast Ads] URL change detected');
        mainFunction();
    }
}

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 1000);
