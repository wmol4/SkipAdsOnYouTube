// ==UserScript==
// @name         Fast Ads
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       Wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let maxRateFound = null;
    let playerElem = null;
    let videoElem = null;
    let intervalID = null;
    let isHidden = false;
    let opacityVal = '0'

    function trySkipAd() {
        let skipButton = document.querySelector('.ytp-ad-skip-button');
        if (skipButton && !skipButton.disabled) {
            skipButton.click();
            console.log('[Fast Ads] HUGE skip');
        }
    }

    function hideElements() {
        if (isHidden === false || playerElem.style.opacity === '1') {
            playerElem.style.opacity = opacityVal;
            videoElem.style.opacity = opacityVal;
            console.log('[Fast Ads] Get blocked, kid');
            isHidden = true;
        }
    }

    function showElements() {
        if (isHidden === true || playerElem.style.opacity !== '1') {
            playerElem.style.opacity = '1';
            videoElem.style.opacity = '1';
            console.log('[Fast Ads] Get unblocked, champ');
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
        let rate = 20;
        const decrement = 1;
        while (rate > 1) { // Ensure rate doesn't go below 1
            try {
                videoElem.playbackRate = rate;
                maxRateFound = rate;
                console.log('[Fast Ads] Max Speed: ' + maxRateFound);
                break;
            } catch (error) {
                // Error when setting unsupported playback rate, just continue with the loop
            }
            rate -= decrement;
        }
        if (maxRateFound === null) {
            maxRateFound = 1;
        }
    }

    function speedUpAds() {
        if (playerElem.classList.contains('ad-interrupting')) {
            if (maxRateFound === null) { // first call to set isInterrupting and maxRateFound
                getMaxRate();
            }
            if (intervalID === null) {
                // Start clicking the skip ad button every 100ms, set the ID to close later
                intervalID = setInterval(trySkipAd, 100);
            }
            hideElements();
            videoElem.playbackRate = maxRateFound;
            videoElem.muted = true;
        } else {
            showElements();
            closeInterval();
            videoElem.muted = false; // Unmute the video
            videoElem.playbackRate = 1;
        }
    }

    function observePlayerChanges() {
        speedUpAds();
        const observer = new MutationObserver(function(mutationsList, observer) {
            speedUpAds();
        });

        // Start observing
        observer.observe(playerElem, {
            attributes: true,
            attributeFilter: ['class'] // Only look for changes in the class attribute
        });
    }

    function waitForBodyAndObserve(callback) {
        if (document.body) {
            callback();
        } else {
            setTimeout(() => waitForBodyAndObserve(callback), 10);
        }
    }

    function waitForElementsAndObserve() {
        playerElem = document.querySelector('.html5-video-player');
        videoElem = document.querySelector('video');
        if (playerElem && videoElem) {
            observePlayerChanges();
        } else {
            let observer = new MutationObserver(function(mutations) {
                playerElem = playerElem || document.querySelector('.html5-video-player');
                videoElem = videoElem || document.querySelector('video');
                if (playerElem && videoElem) {
                    observePlayerChanges();
                    observer.disconnect();
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    waitForBodyAndObserve(waitForElementsAndObserve);

})();
