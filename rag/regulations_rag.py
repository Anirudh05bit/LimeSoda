import re

REGULATIONS = [
    {
        "id": "RBI-KYC-SEC-35",
        "source": "RBI (Reserve Bank of India)",
        "title": "KYC Master Direction - Section 35: Monitoring of Transactions",
        "text": "Regulated Entities (REs) shall monitor transactions of clients in a risk-based manner. Special attention must be paid to complex, unusually large transactions, or patterns of transactions which have no apparent economic or visible lawful purpose. REs shall maintain a close watch on accounts of high-risk customers, politically exposed persons (PEPs), and accounts operating from high-risk countries.",
        "keywords": ["rbi", "monitoring", "transactions", "risk-based", "large transactions", "pep", "high-risk"]
    },
    {
        "id": "RBI-KYC-SEC-38",
        "source": "RBI (Reserve Bank of India)",
        "title": "KYC Master Direction - Section 38: Reporting to FIU-IND",
        "text": "Regulated Entities shall report Suspicious Transactions (STR) to the Financial Intelligence Unit-India (FIU-IND) within 7 days of arriving at a conclusion that the transaction, whether attempted or executed, is suspicious. Information regarding STRs must be kept strictly confidential ('tipping-off' is prohibited).",
        "keywords": ["rbi", "str", "suspicious transaction report", "fiu-ind", "7 days", "tipping-off", "reporting"]
    },
    {
        "id": "RBI-KYC-SEC-41",
        "source": "RBI (Reserve Bank of India)",
        "title": "KYC Master Direction - Section 41: Politically Exposed Persons (PEPs)",
        "text": "Enhanced due diligence (EDD) must be conducted for Politically Exposed Persons (PEPs). REs shall gather sufficient information on the PEP, establish source of wealth and funds, and obtain senior management approval before establishing business relations. Ongoing transaction monitoring must be heightened.",
        "keywords": ["rbi", "pep", "politically exposed persons", "edd", "due diligence", "source of wealth"]
    },
    {
        "id": "FATF-REC-10",
        "source": "FATF (Financial Action Task Force)",
        "title": "Recommendation 10: Customer Due Diligence (CDD)",
        "text": "Financial institutions should perform Customer Due Diligence (CDD) when establishing business relations, carrying out occasional transactions above the threshold of USD/EUR 15,000, or when there is a suspicion of money laundering or terrorist financing, regardless of any thresholds.",
        "keywords": ["fatf", "cdd", "due diligence", "threshold", "15000", "customer verification"]
    },
    {
        "id": "FATF-REC-16",
        "source": "FATF (Financial Action Task Force)",
        "title": "Recommendation 16: Wire Transfers (Travel Rule)",
        "text": "Financial institutions must ensure that wire transfers contain accurate and required originator and beneficiary information (name, account number, address, identifier). This information must remain with the transfer throughout the payment chain to prevent money laundering and track fund flows.",
        "keywords": ["fatf", "travel rule", "wire transfer", "originator", "beneficiary", "payment chain"]
    },
    {
        "id": "FATF-REC-20",
        "source": "FATF (Financial Action Task Force)",
        "title": "Recommendation 20: Suspicious Transaction Reporting",
        "text": "If a financial institution suspects or has reasonable grounds to suspect that funds are the proceeds of a criminal activity, or are related to terrorist financing, it shall be required by law to report its suspicions promptly to the Financial Intelligence Unit (FIU).",
        "keywords": ["fatf", "reporting", "str", "suspicious", "proceeds of crime", "fiu"]
    },
    {
        "id": "FINCEN-CTR-10K",
        "source": "FinCEN (US Financial Crimes Enforcement Network)",
        "title": "Title 31 CTR: Currency Transaction Report",
        "text": "Financial institutions must file a Currency Transaction Report (CTR) for each transaction in currency (deposit, withdrawal, exchange, or transfer) of more than $10,000 USD. This applies to physical cash movements and electronic equivalents flagged under cash-like controls.",
        "keywords": ["fincen", "ctr", "10000", "threshold", "cash", "currency transaction report"]
    },
    {
        "id": "FINCEN-STRUCTURING",
        "source": "FinCEN (US Financial Crimes Enforcement Network)",
        "title": "31 U.S.C. 5324: Prohibition on Structuring",
        "text": "It is a crime to structure transactions for the purpose of evading currency transaction reporting requirements. Structuring (or 'smurfing') involves breaking up a single large transaction (e.g., $30,000) into multiple smaller transactions (e.g., three transactions of $9,900) to keep each below the $10,000 CTR filing threshold.",
        "keywords": ["fincen", "structuring", "smurfing", "evasion", "10000", "ctr", "split transactions"]
    },
    {
        "id": "SEBI-AML-GUIDELINES",
        "source": "SEBI (Securities and Exchange Board of India)",
        "title": "SEBI AML Guidelines: Record Keeping & Client Identity",
        "text": "All registered intermediaries shall maintain records of client identity, transaction records, and communications for at least 5 years. Intermediaries must monitor transaction patterns for clients and generate alerts for suspicious trades or flows, reporting them to FIU-IND.",
        "keywords": ["sebi", "record keeping", "5 years", "intermediaries", "alerts", "fiu-ind", "client identity"]
    },
    {
        "id": "AML-LAYERING",
        "source": "Anti-Money Laundering standard principles",
        "title": "AML Concepts: Three Stages of Money Laundering (Layering)",
        "text": "Money laundering involves three stages: Placement (introducing illegal cash into the financial system), Layering (moving funds through complex multi-hop transfers and offshore accounts to obscure the source), and Integration (re-introducing the 'clean' funds into the legitimate economy). Circular transfer patterns and immediate splitting and merging are primary indicators of Layering.",
        "keywords": ["layering", "placement", "integration", "circular", "laundering", "multi-hop", "splitting", "merging"]
    }
]

class RegulationsRAG:
    @staticmethod
    def search(query: str, top_n: int = 3):
        if not query:
            return REGULATIONS[:top_n]
            
        # Clean query and extract terms
        query_terms = re.findall(r'\w+', query.lower())
        
        results = []
        for reg in REGULATIONS:
            score = 0
            # Calculate match scores
            title_text = reg["title"].lower()
            text_body = reg["text"].lower()
            
            for term in query_terms:
                # Term in title gets 5 points
                if term in title_text:
                    score += 5
                # Term in keywords gets 3 points
                if term in reg["keywords"]:
                    score += 3
                # Term in text body gets 1 point
                if term in text_body:
                    score += 1
            
            results.append((score, reg))
            
        # Sort by score descending
        results.sort(key=lambda x: x[0], reverse=True)
        
        # Return top N
        return [item[1] for item in results[:top_n] if item[0] > 0] or REGULATIONS[:top_n]

if __name__ == "__main__":
    # Test the search
    rag = RegulationsRAG()
    res = rag.search("structuring under 10000 limit")
    print("Search Results for 'structuring under 10000 limit':")
    for r in res:
        print(f"- [{r['id']}] {r['title']}: {r['text'][:60]}...")
