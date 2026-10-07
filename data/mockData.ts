export type Category = {
    slug: string;
    title: string;
    image: string;
    description?: string;
};

export type Exercise = {
    id: string;
    category: string;
    title: string;
    image: string;
    subtitle: string;
    explanation: string;
    instructions: string;
    simplify: string;
    buildUp: string;
    difficulty: string;
    audience: string[];
};

export const categories: Category[] = [
    {
        slug: "aanname-van-de-bal",
        title: "Aanname van de bal",
        image: "https://picsum.photos/600/400?random=1",
        description: "Oefeningen voor balaanname en eerste controle.",
    },
    {
        slug: "afpakken-van-de-bal",
        title: "Afpakken van de bal",
        image: "https://picsum.photos/600/400?random=2",
        description: "Oefeningen voor verdedigen, druk zetten en balverovering.",
    },
    {
        slug: "evenaantal",
        title: "Evenaantal",
        image: "https://picsum.photos/600/400?random=3",
        description: "Duel- en spelsituaties met gelijk aantal spelers.",
    },
    {
        slug: "lopen-met-de-bal",
        title: "Lopen met de bal",
        image: "https://picsum.photos/600/400?random=4",
        description: "Techniek en snelheid met bal aan de stick.",
    },
    {
        slug: "overtal",
        title: "Overtal",
        image: "https://picsum.photos/600/400?random=5",
        description: "Aanvals- en positiespel in overtal situaties.",
    },
    {
        slug: "spelconcept",
        title: "Spelconcept",
        image: "https://picsum.photos/600/400?random=6",
        description: "Oefeningen voor teamtactiek en organisatie.",
    },
];

export const exercises: Exercise[] = [
    {
        id: "afpakken-08",
        category: "afpakken-van-de-bal",
        title: "Afpakken van de bal - 08",
        image: "https://picsum.photos/900/600?random=10",
        subtitle: "Het verbeteren van 1 tegen 1 verdedigend.",
        explanation:
            "Speler 1 passt naar speler 2 en terug naar speler 1. Daarna speelt speler 1 de bal naar speler 3. Speler 3 neemt de bal in de loop aan en speelt 1 tegen 1 tegen speler 2.",
        instructions:
            "Zet één voet voor en één voet achter. Beweeg licht op de bal van je voet zodat je snel kunt reageren. Houd je ogen op de bal en gebruik een block tackle op het juiste moment.",
        simplify:
            "Maak de afstand kleiner zodat de aanvaller met minder snelheid op de verdediger afkomt.",
        buildUp:
            "Laat de verdediger na balverovering direct afronden op een mini-goal.",
        difficulty: "Gemiddeld",
        audience: ["Jeugd", "Senioren"],
    },
    {
        id: "block-tackle",
        category: "afpakken-van-de-bal",
        title: "Block tackle",
        image: "https://picsum.photos/900/600?random=11",
        subtitle: "Verdedigende techniek in duelvorm.",
        explanation:
            "Deze oefening richt zich op houding, timing en het goed inzetten van een block tackle.",
        instructions:
            "Blijf laag, stuur de aanvaller naar buiten en kies pas het juiste moment om in te grijpen.",
        simplify: "Verlaag het tempo en maak het veld kleiner.",
        buildUp: "Voeg na balverovering een counter toe.",
        difficulty: "Makkelijk",
        audience: ["Jeugd"],
    },
    {
        id: "channelen",
        category: "afpakken-van-de-bal",
        title: "Channelen",
        image: "https://picsum.photos/900/600?random=12",
        subtitle: "Aanvaller naar de buitenkant dwingen.",
        explanation:
            "Je leert de binnenkant af te sluiten en de aanvaller richting de zijlijn te begeleiden.",
        instructions:
            "Sluit de binnenkant, houd je stick laag en blijf in beweging.",
        simplify: "Laat de aanvaller eerst zonder snelheid starten.",
        buildUp: "Voeg een tweede aanvaller toe.",
        difficulty: "Gemiddeld",
        audience: ["Jeugd", "Senioren"],
    },
    {
        id: "dubbelen",
        category: "afpakken-van-de-bal",
        title: "Dubbelen",
        image: "https://picsum.photos/900/600?random=13",
        subtitle: "Samen druk zetten op de balbezitter.",
        explanation:
            "Twee verdedigers werken samen om de bal af te pakken en passlijnen af te schermen.",
        instructions:
            "Eén speler zet druk op de bal, de ander sluit de passlijn af.",
        simplify: "Werk eerst op een lager tempo.",
        buildUp: "Voeg meerdere afspeelmogelijkheden toe.",
        difficulty: "Moeilijk",
        audience: ["Senioren"],
    },
];