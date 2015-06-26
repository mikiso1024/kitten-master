var km = function() {
    var timer = null;

    var mustFarm = false;
    var oldJobs = null;

    var tabStack = [];

    var module = {
        maxResPercent: 0.99,
        autoGather: true,
        autoFarm: true,
        autoObserve: true,
        autoHunt: true,
        autoCraft: true,
        autoTrade: true,
        autoPray: true,
        autoBuild: true,
        autoScience: true
    };

    function getTab(tabId) {
        var tab = null;

        for (var i = 0; i < gamePage.tabs.length; ++i) {
            if (gamePage.tabs[i].tabId === tabId) {
                tab = gamePage.tabs[i];
                break;
            }
        }

        return tab;
    }

    function showTab(name) {
        gamePage.activeTabId = name;
        gamePage.render();
    }

    function pushTab(name) {
        tabStack.push(gamePage.activeTabId);
        showTab(name);
    }

    function popTab() {
        showTab(tabStack.pop());
    }

    function getButton(tab, name) {
        var button = null;

        if (tab.buttons.length === 0) {
            pushTab(tab.tabId);
            popTab();
        }

        for (var i = 0; i < tab.buttons.length; ++i) {
            if ((tab.buttons[i].name === name) ||
                (tab.buttons[i].buildingName === name) ||
                (tab.buttons[i].techName === name)) {
                button = tab.buttons[i];
                break;
            }
        }

        return button;
    }

    function gather() {
        if (module.autoGather && (gamePage.gatherClicks < 2499)) {
            var res = gamePage.resPool.get('catnip');

            if (res.value < res.maxValue) {
                var tab = getTab('Bonfire');
                var button = getButton(tab, 'Gather catnip');
                button.onClick(button);
            }
        }
    }

    function observe() {
        if (module.autoObserve && $('#observeBtn').length) {
            $('#observeBtn').click();
        }
    }

    function hunt() {
        if (module.autoHunt && gamePage.science.get('archery').researched &&
            gamePage.villageTab.visible) {
            var button = gamePage.villageTab.huntBtn;

            if (!button) {
                pushTab(gamePage.villageTab.tabId);
                button = gamePage.villageTab.huntBtn;
                popTab();
            }

            if (button) {
                for (var i = 0; i < button.prices.length; ++i) {
                    var res = gamePage.resPool.get(button.prices[i].name);

                    if ((res.value < button.prices[i].val) ||
                        (res.value < (res.maxValue * module.maxResPercent))) {
                        return;
                    }
                }

                button.onClick(button);
            }
        }
    }

    function craftItem(craftName, amount) {
        if (module.autoCraft) {
            var craft = gamePage.workshop.getCraft(craftName);

            if (craft.unlocked) {
                for (var i = 0; i < craft.prices.length; ++i) {
                    var res = gamePage.resPool.get(craft.prices[i].name);

                    // TODO: handle resources without max values
                    if ((res.value < (craft.prices[i].val * amount)) ||
                        (res.value < (res.maxValue * module.maxResPercent))) {
                        return;
                    }
                }

                gamePage.craft(craftName, amount);
            }
        }
    }

    function craft() {
        if (module.autoCraft) {
            craftItem('wood', 1);
            craftItem('beam', 1);
            craftItem('slab', 1);
            craftItem('plate', 1);
            craftItem('steel', 1);
            craftItem('parchment', 1);
            craftItem('manuscript', 1);
            craftItem('compedium', 1);
        }
    }

    function canTrade(raceName) {
        var result = false;

        var manpower = gamePage.resPool.get('manpower');
        var gold = gamePage.resPool.get('gold');
        var race = gamePage.diplomacy.get(raceName);

        if (module.autoTrade && gamePage.diplomacyTab.visible &&
            race.unlocked &&
            (manpower.value >= 50) &&
            (manpower.value >= (manpower.maxValue * module.maxResPercent)) &&
            (gold.value >= 15) &&
            (gold.value >= (gold.maxValue * module.maxResPercent))) {

            // We're good as long as we have enough resources to sell
            result = true;

            for (var i = 0; i < race.buys.length; ++i) {
                var res = gamePage.resPool.get(race.buys[i].name);

                if (res.value < race.buys[i].val) {
                    result = false;
                    break;
                }
            }
        }

        return result;
    }

    function tradeWith(raceName) {
        if (canTrade(raceName)) {
            var race = gamePage.diplomacy.get(raceName);

            var origTab = gamePage.activeTabId;

            if (gamePage.diplomacyTab.racePanels.length === 0) {
                showTab(gamePage.diplomacyTab.tabId);
            }

            for (var j = 0; j < gamePage.diplomacyTab.racePanels.length; ++j) {
                if (gamePage.diplomacyTab.racePanels[j].name == race.title) {
                    if (!gamePage.diplomacyTab.racePanels[j].tradeBtn.enabled) {
                        showTab(gamePage.diplomacyTab.tabId);
                    }

                    var button = gamePage.diplomacyTab.racePanels[j].tradeBtn;
                    button.onClick(button);

                    break;
                }
            }

            if (gamePage.activeTabId != origTab) {
                showTab(origTab);
            }
        }
    }

    function trade() {
        if (module.autoTrade && gamePage.diplomacyTab.visible) {
            // TODO: Try others besides Zebras
            tradeWith('zebras');
        }
    }

    // Returns true if the item was built
    function buildItem(name) {
        if (module.autoBuild) {
            var building = gamePage.bld.getBuilding(name);

            if (building.unlocked) {
                var prices = gamePage.bld.getPrices(name);

                for (var i = 0; i < prices.length; ++i) {
                    var res = gamePage.resPool.get(prices[i].name);

                    if (res.value < prices[i].val) {
                        return false;
                    }
                }

                // Now get the button so we can click it
                console.log('Building: ' + name);
                var tab = getTab('Bonfire');
                pushTab(tab.tabId);
                var button = getButton(tab, name);
                button.onClick(button);
                popTab();
                return true;
            }
        }

        return false;
    }

    // Try to maintain the right number of fields to feed kittens with surplus
    function buildField() {
        var building = gamePage.bld.getBuilding('field');

        // TODO: calculate real ratios
        var target = Math.ceil((gamePage.getEffect('maxKittens') + 2) * 6.8);

        if (building.val < target) {
            return buildItem('field');
        }
    }

    // Try not to overpopulate
    function buildHut() {
        var field = gamePage.bld.getBuilding('field');
        var hut = gamePage.bld.getBuilding('hut');

        if (gamePage.science.get('agriculture').researched) {
            // TODO: some sort of logic...
            // TODO: calculate real ratios
            var min = Math.ceil(gamePage.getEffect('maxKittens') * 6.8);

            if (field.val >= min) {
                return buildItem('hut');
            }
        } else {
            // Only build 1 to help prevent winter deaths
            if (hut.val === 0) {
                return buildItem('hut');
            }
        }
    }

    function build() {
        if (module.autoBuild) {
            // DUMB IMPLEMENTATION; GREEDY (MOSTLY)
            for (var i = 0; i < gamePage.bld.buildingsData.length; ++i) {
                var building = gamePage.bld.buildingsData[i];

                // Only build one building per run
                if (building.name === 'field') {
                    if (buildField()) {
                        break;
                    }
                } else if (building.name === 'hut') {
                    if (buildHut()) {
                        break;
                    }
                } else if (buildItem(building.name)) {
                    break;
                }
            }
        }
    }

    // Protect against starvation; keep catnip over 5%
    function farm() {
        if (module.autoFarm &&
            gamePage.science.get('agriculture').researched) {
            var res = gamePage.resPool.get('catnip');

            if (!mustFarm && (res.value <= (res.maxValue * 0.05))) {
                mustFarm = true;

                // save old work assignments
                oldJobs = [];

                for (var i = 0; i < gamePage.village.jobs.length; ++i) {
                    oldJobs.push(gamePage.village.jobs[i].value);
                }

                // make everyone farmers
                gamePage.village.clearJobs();
                var job = gamePage.village.getJob('farmer');
                var free = gamePage.village.getFreeKittens();
                for (var j = 0; j < free; ++j) {
                    gamePage.village.assignJob(job);
                }
            } else if (mustFarm && (res.value >= (res.maxValue * 0.06))) {
                mustFarm = false;

                // restore old work assignments
                gamePage.village.clearJobs();

                for (var i = 0; i < gamePage.village.jobs.length; ++i) {
                    if (oldJobs[i] > 0) {
                        for (var j = 0; j < oldJobs[i]; ++j) {
                            gamePage.village.assignJob(gamePage.village.jobs[i]);
                        }
                    }
                }

                oldJobs = null;
            }
        }
    }

    function pray() {
        if (module.autoPray) {
            var res = gamePage.resPool.get('faith');

            if (res.value >= (res.maxValue * module.maxResPercent)) {
                gamePage.religion.praise();
            }
        }
    }

    function getTech(name) {
        var result = null;

        for (var i = 0; i < gamePage.science.techs.length; ++i) {
            if (gamePage.science.techs[i].name === name) {
                result = gamePage.science.techs[i];
                break;
            }
        }

        return result;
    }

    // A bit hacky because the game ties prices to the button
    function canResearch(button) {
        var result = false;

        var tech = getTech(button.techName);

        if (tech.unlocked && !tech.researched) {
            result = true;

            for (var i = 0; i < button.prices.length; ++i) {
                var res = gamePage.resPool.get(button.prices[i].name);

                if (res.value < button.prices[i].val) {
                    result = false;
                    break;
                }
            }
        }

        return result;
    }

    function science() {
        if (module.autoScience) {
            var tab = getTab('Science');

            if (tab.buttons.length === 0) {
                pushTab(tab.tabId);
                popTab();
            }

            // DUMB IMPLEMENTATION; GREEDY
            for (var i = 0; i < tab.buttons.length; ++i) {
                var button = tab.buttons[i];

                if (canResearch(button)) {
                    console.log('Researching: ' + button.name);
                    button.onClick();
                    pushTab(tab.tabId);
                    popTab();
                    // Only research one tech per run
                    break;
                }
            }
        }
    }

    function getRawPrices(prices) {
        var result = {};

        if (prices && prices.length) {
            for (var i = 0; i < prices.length; ++i) {
                var res = gamePage.resPool.get(prices[i].name);

                // Because wood is craftable, but we don't care about catnip
                if (res.craftable && res.name !== 'wood') {
                    var craft = gamePage.workshop.getCraft(res.name);
                    var raw = getRawPrices(gamePage.workshop.getCraftPrice(craft));
                    for (var name in raw) {
                        result[name] = (result[name] || 0) +
                            (raw[name] * prices[i].val);
                    }
                } else {
                    result[res.name] = (result[res.name] || 0) + prices[i].val;
                }
            }
        }

        return result;
    }

    // Assumes prices given as result object from getRawPrices()
    function getRawTimes(prices) {
        var result = {};

        if (prices) {
            for (var name in prices) {
                var res = gamePage.resPool.get(name);

                if (res.perTickUI) {
                    result[name] = (prices[name] - res.value) /
                        (res.perTickUI * gamePage.rate);
                } else {
                    result[name] = NaN;
                }
            }
        }

        return result;
    }

    module.auto = function auto(on) {
        if (!on) {
            clearInterval(timer);
        } else if (!timer) {
            timer = setInterval(function() {
                observe();
                gather();
                science();
                trade();
                hunt();
                craft();
                build();
                pray();
                farm();
            }, 100);
        }
    }

    module.start = function() {
        module.auto(true);
    }

    module.stop = function() {
        module.auto(false);
    }

    return module;
}();
